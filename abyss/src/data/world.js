// 世界（章・地域・ステージ）。物語は第 1〜10 章、各章 5 地域、各地域 10 ステージ（10 番目はボス）。
// エリアレベル: 地域ごとに level（その地域の敵のレベル。ステージ 6 から +1）。level ≈ 1 + 通し番号 × 2（1〜99）。
//
// 形:
// ACTS: [{ id, name, desc, color, bg: 'bg.<actId>', theme, zones: [
//   { id, name, level, desc, monsters: [id...]（3〜5 種）, elites?: [id...]（チャンピオンになりやすい敵）, boss: id, bg?: 'bg.<zoneId>' }
// ], actBoss: id }]
// ステージ番号 1〜10。stage 10 は地域のボス（制限時間あり）。5 地域目の stage 10 は章のボス。
// 苦行（物語クリア後）では地域のボスが「門の欠片」を落とす（GATE_GROUPS）。

export const STAGES_PER_ZONE = 10;
export const WAVES_PER_STAGE = 3;
export const BOSS_TIME = 30; // ボスの制限時間（秒）。章のボスは ×1.8、深淵王は ×2.5
export const ACT_BOSS_TIME_MUL = 1.8;
export const FINAL_BOSS_TIME_MUL = 2.5;
// 最初の 2 地域のボスはやさしく（はじめての 5 分で負けないように）。[ライフ, 攻撃] の倍率
export const EARLY_BOSS = { 0: [0.6, 0.6], 1: [0.85, 0.85] };
export const ACT_BOSS_LIFE_MUL = 0.75; // 章のボスのライフ（BAL.RANK.actboss に掛ける。章の終わりの壁を「少し稼げば越えられる」に）

export const ACTS = [
  {
    id: 'act1', name: '第一章　灰の村', desc: '空から降った灰が村を覆い、地の裂け目から屍が這い出した。すべての始まりの地。', color: '#9a8a7a', bg: 'bg.act1',
    theme: '灰の降る寒村・腐った森・墓地・沼・礼拝堂。灰色と枯れた茶、遠くに赤い月',
    zones: [
      { id: 'a1z1', name: '灰降る村はずれ', level: 1, desc: '灰に埋もれた畑と、戸の開いたままの家々。', monsters: ['rot_zombie', 'ash_wolf', 'grave_bat'], boss: 'boss_butcher' },
      { id: 'a1z2', name: '腐れ森の入口', level: 3, desc: '枯れ木に白い糸が絡みつく森の入口。', monsters: ['rot_zombie', 'ash_wolf', 'bog_slime', 'carrion_spider'], boss: 'boss_widow' },
      { id: 'a1z3', name: '静かな墓地', level: 5, desc: '墓石がすべて内側から押し開けられている。', monsters: ['rot_zombie', 'bone_archer', 'grave_bat', 'ghoul'], elites: ['bone_archer'], boss: 'boss_gravewarden' },
      { id: 'a1z4', name: '沈む沼地', level: 7, desc: '灰の混じった黒い泥が、足をつかんで離さない。', monsters: ['bog_slime', 'ash_wolf', 'cultist', 'ash_wisp'], boss: 'boss_bogmother' },
      { id: 'a1z5', name: '灰の礼拝堂', level: 9, desc: '灰を崇める信徒たちの祈りが響く、崩れかけた礼拝堂。', monsters: ['cultist', 'bone_archer', 'rot_zombie', 'ghoul', 'ash_wisp'], elites: ['cultist'], boss: 'boss_ashlord' },
    ],
    actBoss: 'boss_ashlord',
  },
  {
    id: 'act2', name: '第二章　砂塵の墓所', desc: '灼けた砂の下に眠る古王の墓。乾いた呪いが旅人を干からびさせる。', color: '#d8a04a', bg: 'bg.act2',
    theme: '砂漠・砂丘・崩れた神殿と墓・オベリスク。橙と金の夕空、砂嵐',
    zones: [
      { id: 'a2z1', name: '熱砂の街道', level: 11, desc: '隊商の骨が道しるべになった、灼けた街道。', monsters: ['dune_scorpion', 'vulture_harpy', 'sand_serpent', 'tomb_scarab'], boss: 'boss_zarak' },
      { id: 'a2z2', name: '風鳴りの砂丘', level: 13, desc: '風が砂丘を鳴らし、その下で何かがうごめく。', monsters: ['sand_serpent', 'dune_scorpion', 'dust_djinn', 'vulture_harpy'], elites: ['sand_serpent'], boss: 'boss_duram' },
      { id: 'a2z3', name: '崩れた陽の神殿', level: 15, desc: '太陽を祀った神殿。祭司たちは今も祈りを続ける。', monsters: ['sun_priest', 'sand_mummy', 'tomb_scarab', 'tomb_archer'], boss: 'boss_setira' },
      { id: 'a2z4', name: '方尖塔の谷', level: 17, desc: '黒い方尖塔が並ぶ谷。石が囁く声がする。', monsters: ['sand_golem', 'dust_djinn', 'tomb_archer', 'dune_scorpion'], elites: ['sand_golem'], boss: 'boss_obelisk' },
      { id: 'a2z5', name: '古王の地下墓所', level: 19, desc: '古王の眠る地下墓所。千の棺がひとつずつ開いていく。', monsters: ['sand_mummy', 'tomb_archer', 'sun_priest', 'sand_golem', 'tomb_scarab'], elites: ['sun_priest'], boss: 'boss_amrahet' },
    ],
    actBoss: 'boss_amrahet',
  },
  {
    id: 'act3', name: '第三章　凍てつく峰', desc: '吹雪の止まぬ山脈。氷に閉ざされた古の砦に、白い獣と亡霊がさまよう。', color: '#9ad8ff', bg: 'bg.act3',
    theme: '雪山・氷の洞窟・凍った滝・氷河の砦。青白い光、オーロラ',
    zones: [
      { id: 'a3z1', name: '吹雪の登り道', level: 21, desc: '一歩先も見えない吹雪の山道。遠吠えが近づいてくる。', monsters: ['frost_wolf', 'snow_harpy', 'frost_hunter', 'yeti'], boss: 'boss_valk' },
      { id: 'a3z2', name: '氷柱の洞窟', level: 23, desc: '天井から無数の氷柱が垂れる洞窟。糸がきらめく。', monsters: ['crystal_spider', 'ice_wraith', 'ice_shard', 'frost_wolf'], elites: ['crystal_spider'], boss: 'boss_silva' },
      { id: 'a3z3', name: '凍て滝', level: 25, desc: '流れ落ちる姿のまま凍りついた大滝。', monsters: ['ice_shard', 'ice_golem', 'ice_wraith', 'snow_harpy'], boss: 'boss_falls' },
      { id: 'a3z4', name: '氷河の砦', level: 27, desc: '氷河に呑まれた砦。兵士たちは持ち場を離れない。', monsters: ['frozen_soldier', 'frost_hunter', 'ice_golem', 'yeti'], elites: ['frozen_soldier'], boss: 'boss_bram' },
      { id: 'a3z5', name: '霜竜の巣', level: 29, desc: '峰の頂、オーロラの下に白い竜の巣がある。', monsters: ['frozen_soldier', 'ice_wraith', 'yeti', 'crystal_spider', 'ice_shard'], boss: 'boss_humris' },
    ],
    actBoss: 'boss_humris',
  },
  {
    id: 'act4', name: '第四章　沈んだ都', desc: '海に呑まれた王都。崩れた塔の間を、鱗のある者たちが泳ぎ回る。', color: '#4ac0b0', bg: 'bg.act4',
    theme: '水没した都・珊瑚・崩れた塔・海底の神殿。青緑の光の筋、泡',
    zones: [
      { id: 'a4z1', name: '潮だまりの外壁', level: 31, desc: '潮が引くたびに現れる、王都の外壁。', monsters: ['coral_crab', 'drowned', 'harpooner', 'storm_jelly'], boss: 'boss_gargan' },
      { id: 'a4z2', name: '珊瑚の大通り', level: 33, desc: '石畳を珊瑚が覆った大通り。市民はまだ歩いている。', monsters: ['drowned', 'scale_guard', 'deep_eel', 'harpooner'], elites: ['scale_guard'], boss: 'boss_drowned_knight' },
      { id: 'a4z3', name: '傾いた鐘楼', level: 35, desc: '傾いたまま鳴り続ける鐘楼。歌声が混じる。', monsters: ['siren', 'storm_jelly', 'deep_eel', 'abyssal_polyp'], boss: 'boss_mercie' },
      { id: 'a4z4', name: '沈黙の海底神殿', level: 37, desc: '光の筋が差し込む海底の神殿。音が消える。', monsters: ['tide_spirit', 'coral_crab', 'scale_guard', 'siren'], elites: ['tide_spirit'], boss: 'boss_coral_titan' },
      { id: 'a4z5', name: '海淵の玉座の間', level: 39, desc: '王都の底の玉座の間。巨大な影が王冠を抱く。', monsters: ['scale_guard', 'abyssal_polyp', 'tide_spirit', 'deep_eel', 'harpooner'], boss: 'boss_orgula' },
    ],
    actBoss: 'boss_orgula',
  },
  {
    id: 'act5', name: '第五章　紅蓮の溶鉱炉', desc: '地の底の炉が魔物を鍛え続ける。溶けた岩の川を越えて進め。', color: '#ff6a2a', bg: 'bg.act5',
    theme: '火山・溶岩の川・巨大な炉と鎖・黒い岩。赤と橙、火の粉',
    zones: [
      { id: 'a5z1', name: '煤けた坑道', level: 41, desc: '煤で真っ黒な坑道。炉の奴隷が鎖を引きずる。', monsters: ['forge_slave', 'fire_imp', 'magma_hound', 'chain_demon'], boss: 'boss_volka' },
      { id: 'a5z2', name: '溶岩の川辺', level: 43, desc: '赤く光る溶岩の川。岸の岩も熱で揺らいでいる。', monsters: ['lava_blob', 'salamander', 'magma_hound', 'flame_spirit'], elites: ['magma_hound'], boss: 'boss_lava_wyrm' },
      { id: 'a5z3', name: '鎖の吊り橋', level: 45, desc: '溶岩の上に鎖で吊られた橋。罪人が吊るされている。', monsters: ['chain_demon', 'fire_imp', 'forge_slave', 'salamander'], boss: 'boss_executioner' },
      { id: 'a5z4', name: '大鍛冶場', level: 47, desc: '巨大な金床が並ぶ鍛冶場。魔物の武具が次々と打たれる。', monsters: ['forge_construct', 'obsidian_golem', 'forge_slave', 'lava_blob'], elites: ['obsidian_golem'], boss: 'boss_gordon' },
      { id: 'a5z5', name: '炉心', level: 49, desc: 'すべての炉の熱が集まる場所。王が心臓を燃やしている。', monsters: ['obsidian_golem', 'flame_spirit', 'chain_demon', 'magma_hound', 'fire_imp'], boss: 'boss_ignas' },
    ],
    actBoss: 'boss_ignas',
  },
  {
    id: 'act6', name: '第六章　毒霧の森沼', desc: '巨大な茸と毒の霧が満ちる森。吸い込めば肺が腐る。', color: '#9ad04a', bg: 'bg.act6',
    theme: '巨大な茸・毒の沼・蜘蛛の巣・朽ちた大樹。黄緑と紫の霧、胞子',
    zones: [
      { id: 'a6z1', name: '胞子の降る小径', level: 51, desc: '胞子が雪のように降る小径。足元の茸が笑う。', monsters: ['myconid', 'spore_bloat', 'lantern_moth', 'giant_toad'], boss: 'boss_mother_cap' },
      { id: 'a6z2', name: '大茸の森', level: 53, desc: '塔ほどもある茸が並ぶ森。かさの裏に何かが棲む。', monsters: ['myconid', 'venom_wasp', 'bog_spider', 'spore_bloat'], elites: ['venom_wasp'], boss: 'boss_venora' },
      { id: 'a6z3', name: '蜘蛛の巣窟', level: 55, desc: '木々の間を埋め尽くす巣。獲物の繭がぶら下がる。', monsters: ['bog_spider', 'lantern_moth', 'bog_witch', 'venom_wasp'], boss: 'boss_grogg' },
      { id: 'a6z4', name: '腐れ沼の底', level: 57, desc: '毒の沼の底。泡がはじけるたび霧が濃くなる。', monsters: ['swamp_troll', 'giant_toad', 'bog_witch', 'rot_treant'], elites: ['swamp_troll'], boss: 'boss_elder_tree' },
      { id: 'a6z5', name: '朽ちた世界樹', level: 59, desc: '世界を支えたという大樹。根元で竜が朽ちている。', monsters: ['rot_treant', 'swamp_troll', 'venom_wasp', 'myconid', 'bog_witch'], boss: 'boss_valne' },
    ],
    actBoss: 'boss_valne',
  },
  {
    id: 'act7', name: '第七章　天穹の廃城', desc: '雲の上に浮かぶ白亜の城。狂った天の使いが侵入者を裁く。', color: '#f0e0a0', bg: 'bg.act7',
    theme: '雲の上の白い城・崩れた回廊・浮かぶ島・雷雲。白と金、嵐の光',
    zones: [
      { id: 'a7z1', name: '雲の階', level: 61, desc: '雲に浮かぶ白い階段。踏み外せば地の底まで落ちる。', monsters: ['cloud_knight', 'storm_eagle', 'halo_archer', 'thunder_spark'], boss: 'boss_cloud_warden' },
      { id: 'a7z2', name: '浮島の庭園', level: 63, desc: '空に浮かぶ島々の庭園。翼のある獣が見張る。', monsters: ['griffon', 'storm_eagle', 'fallen_seraph', 'hymn_caster'], elites: ['griffon'], boss: 'boss_thunder_captain' },
      { id: 'a7z3', name: '崩れた回廊', level: 65, desc: '天使の像が並ぶ回廊。像の目が侵入者を追う。', monsters: ['marble_statue', 'judge_spirit', 'halo_archer', 'cloud_knight'], boss: 'boss_inquisitor' },
      { id: 'a7z4', name: '雷鳴の尖塔', level: 67, desc: '雷雲を突き抜ける尖塔。雷が絶えず落ちる。', monsters: ['thunder_spark', 'hymn_caster', 'fallen_seraph', 'marble_statue'], elites: ['fallen_seraph'], boss: 'boss_balance' },
      { id: 'a7z5', name: '天の玉座', level: 69, desc: '雲の上の玉座。光の翼を持つ者が狂ったように笑う。', monsters: ['fallen_seraph', 'cloud_knight', 'griffon', 'judge_spirit', 'halo_archer'], boss: 'boss_serafina' },
    ],
    actBoss: 'boss_serafina',
  },
  {
    id: 'act8', name: '第八章　機巧の迷宮', desc: '歯車が軋む果てなき迷宮。主を失った機械兵がいまも巡回する。', color: '#c89a5a', bg: 'bg.act8',
    theme: '歯車・蒸気管・真鍮の通路・巨大な時計仕掛け。銅と金、蒸気',
    zones: [
      { id: 'a8z1', name: '真鍮の門', level: 71, desc: '真鍮の大門。開くたびに歯車兵が並び出る。', monsters: ['gear_soldier', 'brass_hound', 'sentry_drone', 'clock_spider'], boss: 'boss_overseer' },
      { id: 'a8z2', name: '蒸気の配管路', level: 73, desc: '熱い蒸気が噴き出す配管の迷路。', monsters: ['steam_wraith', 'steam_brute', 'clock_spider', 'cog_magus'], elites: ['steam_brute'], boss: 'boss_clockwarden' },
      { id: 'a8z3', name: '歯車の大広間', level: 75, desc: '天井まで歯車が回る大広間。床も動いている。', monsters: ['scrap_beast', 'gear_soldier', 'repair_unit', 'sentry_drone'], boss: 'boss_boiler' },
      { id: 'a8z4', name: '止まった時計塔', level: 77, desc: '針の止まった時計塔。止まった時の中を機械だけが動く。', monsters: ['cog_magus', 'brass_hound', 'steam_brute', 'repair_unit'], elites: ['cog_magus'], boss: 'boss_gear_empress' },
      { id: 'a8z5', name: '迷宮の心臓', level: 79, desc: '迷宮のすべての歯車が繋がる場所。神が脈打つ。', monsters: ['gear_soldier', 'scrap_beast', 'steam_wraith', 'clock_spider', 'cog_magus'], boss: 'boss_chronogear' },
    ],
    actBoss: 'boss_chronogear',
  },
  {
    id: 'act9', name: '第九章　虚無の境界', desc: '世界の縁がほどけていく場所。形を持たない者たちが手招きする。', color: '#a070ff', bg: 'bg.act9',
    theme: '浮かぶ岩の島・ねじれた空・星の裂け目・結晶。紫と黒、星屑',
    zones: [
      { id: 'a9z1', name: 'ほどける岸辺', level: 81, desc: '大地が糸のようにほどけていく岸辺。', monsters: ['hollow_walker', 'watcher_eye', 'shade', 'void_ray'], boss: 'boss_maw' },
      { id: 'a9z2', name: '浮かぶ岩の島々', level: 83, desc: '結晶で繋がった岩の島々。重さが逆さになる。', monsters: ['prism_golem', 'void_ray', 'astral_serpent', 'hollow_walker'], elites: ['prism_golem'], boss: 'boss_crystal_queen' },
      { id: 'a9z3', name: '星の裂け目', level: 85, desc: '空に走る裂け目から、星屑と影がこぼれ落ちる。', monsters: ['shade', 'rift_hound', 'null_seer', 'star_eater'], boss: 'boss_shadow_bearer' },
      { id: 'a9z4', name: '結晶の荒野', level: 87, desc: '紫の結晶が地平まで続く荒野。結晶の中で何かが眠る。', monsters: ['prism_golem', 'astral_serpent', 'rift_hound', 'watcher_eye'], elites: ['rift_hound'], boss: 'boss_boundary' },
      { id: 'a9z5', name: '虚無の胎', level: 89, desc: '世界の外側。形を持たぬ母が、新しい終わりを孕む。', monsters: ['star_eater', 'null_seer', 'shade', 'hollow_walker', 'void_ray'], boss: 'boss_urnoa' },
    ],
    actBoss: 'boss_urnoa',
  },
  {
    id: 'act10', name: '第十章　深淵の玉座', desc: '深淵の底、すべての魔の源。玉座に座す王が、世界の終わりを待っている。', color: '#ff3a4a', bg: 'bg.act10',
    theme: '地獄の城・骨の柱・血の川・巨大な玉座。深紅と黒、炎の空',
    zones: [
      { id: 'a10z1', name: '血の河', level: 91, desc: '血の色をした河。渡し守が魂の数を数えている。', monsters: ['blood_fiend', 'soul_reaper', 'abyss_spawn', 'pyre_archer'], boss: 'boss_ferryman' },
      { id: 'a10z2', name: '骨の柱廊', level: 93, desc: '勇者たちの骨で組まれた柱が並ぶ廊下。', monsters: ['bone_colossus', 'abyss_knight', 'pyre_archer', 'soul_reaper'], elites: ['bone_colossus'], boss: 'boss_bone_sentinel' },
      { id: 'a10z3', name: '業火の城門', level: 95, desc: '炎の空の下、城門の前で三つ首の獣が吠える。', monsters: ['hellhound', 'pit_brute', 'temptress', 'abyss_spawn'], boss: 'boss_cerbrax' },
      { id: 'a10z4', name: '嘆きの大広間', level: 97, desc: '千の軍勢が整列する大広間。嘆きの声が壁から響く。', monsters: ['abyss_knight', 'pit_brute', 'temptress', 'hellhound'], elites: ['abyss_knight'], boss: 'boss_abyss_general' },
      { id: 'a10z5', name: '深淵の玉座', level: 99, desc: '深淵の底の玉座。すべての魔の源が、世界の終わりを待っている。', monsters: ['abyss_knight', 'blood_fiend', 'soul_reaper', 'pit_brute', 'abyss_spawn'], boss: 'boss_abyss_king' },
    ],
    actBoss: 'boss_abyss_king',
  },
];

export const ZONES = ACTS.flatMap((a, ai) => a.zones.map((z, zi) => ({ ...z, act: a.id, actIdx: ai, zoneIdx: zi, global: ai * 5 + zi })));
export const ZONE = Object.fromEntries(ZONES.map((z) => [z.id, z]));
export const ACT = Object.fromEntries(ACTS.map((a) => [a.id, a]));

/** その地域のステージのエリアレベル */
export const stageLevel = (zone, stage) => zone.level + (stage >= 6 ? 1 : 0);

/** 物語の最後の地域（ここのボスを倒すと苦行と深淵の裂け目が開く） */
export const FINAL_ZONE = 'a10z5';

// ---------------- 門の欠片（苦行で地域のボスが落とす。2 章ずつ 1 組、4 種そろうと門番を呼べる）
// 地域 1〜4 のボスが、それぞれ決まった 1 種を落とす（地域の番号 = 欠片の種類）。
export const GATE_GROUPS = [
  { id: 'g1', acts: ['act1', 'act2'], name: '灰砂の門', keeper: 'gk_ashsand', color: '#d8a04a', frags: ['灰の欠片', '骨の欠片', '砂の欠片', '陽の欠片'] },
  { id: 'g2', acts: ['act3', 'act4'], name: '凍潮の門', keeper: 'gk_frosttide', color: '#7ad0e8', frags: ['霜の欠片', '氷の欠片', '潮の欠片', '珊瑚の欠片'] },
  { id: 'g3', acts: ['act5', 'act6'], name: '炎毒の門', keeper: 'gk_emberrot', color: '#d0802a', frags: ['煤の欠片', '溶岩の欠片', '胞子の欠片', '毒牙の欠片'] },
  { id: 'g4', acts: ['act7', 'act8'], name: '雷鋼の門', keeper: 'gk_stormgear', color: '#e0d080', frags: ['雲の欠片', '雷の欠片', '歯車の欠片', '蒸気の欠片'] },
  { id: 'g5', acts: ['act9', 'act10'], name: '終わりの門', keeper: 'gk_endless', color: '#c04a8a', frags: ['虚空の欠片', '星の欠片', '血の欠片', '玉座の欠片'] },
];
export const gateGroupOfAct = (actId) => GATE_GROUPS.findIndex((g) => g.acts.includes(actId));
