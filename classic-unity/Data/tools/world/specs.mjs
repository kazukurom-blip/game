// マップごとの違い（データ）。生成器 generate.mjs は「地形の型」と、ここに書いた値からマップを作る。
//
// 地形の型（tpl）:
//   town      平らな町（屋根や見張り台の小さな段、はしご 1〜2）           例: ブリーズ港・ねむり谷
//   townTall  上下に広い町（地面の上に 2〜3 段、縄・はしご・跳べる段）   例: シルワ森都・セレス
//   townHill  段々の丘の町（地面が坂で段々に上がる）                     例: ポム丘
//   field     平原の狩り場（なだらかな地面＋浮いた足場が 2〜3 層、縄）   例: 港の街道
//   forest    森（field ＋ 跳んで上がる段＝木の根・枝の階段が多い）
//   cliff     岩山・雪山（地面が坂で段々に高くなり、上に縄で登る岩棚）
//   swamp     沼・池・海（水底の地面と、跳び移る浮き島）
//   cave      洞くつ・建物の中（ほぼ全幅の層が 3〜4、はしご）
//   tower     塔（狭く高い。左右交互の層をはしごで結ぶ。上の階へ／下の階へ）
//   ship      船（甲板・船室の屋根・帆柱の縄と見張り台）
//   arena     ボスの間（平らな広場と左右の足場）
//   room      小さな部屋（試験・受付・乗り場）
//   rooms     1 人用ダンジョン（壁で区切った部屋が並び、部屋の出口のポータルで次へ）
//
// 値: bg（背景の種類）/ bgm（SOUND.md の曲の ID）/ w（横幅の範囲）/ layers（層の数）/ rope（'rope' | 'ladder'）
//     objects（調べる物 { id, name, at: 'top' | 'mid' | 'ground-left' | 'ground-right' | 'secret' }）
//     secret（隠し部屋 { from: 'ground-left' | 'ground-right' | 'top', name }。隠しポータルで入る）
//     rooms（部屋の数）/ mobMax（敵の最大数）
export const TYPE_TPL = { 町: 'town', 狩: 'field', 洞: 'cave', ボ: 'arena', 特: 'room', 移: 'room' };

// 地域ごとの初めの値（ID の頭の文字 or 範囲）
export function regionDefaults(id) {
  const r = id[0], n = parseInt(id.slice(1), 10);
  if (r === 'V') {
    if (n === 90) return { bg: 'market', bgm: 'market' };
    if (n >= 100 && n < 200) return { bg: 'beach', bgm: 'field_port' };
    if (n >= 200 && n < 300) return { bg: 'hill', bgm: 'field_pom' };
    if (n >= 300 && n < 400) return { bg: 'forest', bgm: 'field_silva', tplField: 'forest' };
    if (n >= 400 && n < 408) return { bg: 'rock', bgm: 'field_gard', tplField: 'cliff' };
    if (n >= 408 && n < 413) return { bg: 'dig', bgm: 'dungeon_deep' };
    if (n >= 413 && n < 500) return { bg: 'rock', bgm: 'field_gard', tplField: 'cliff' };
    if (n >= 500 && n < 508) return { bg: 'city', bgm: 'field_crow' };
    if (n >= 508 && n < 513) return { bg: 'swamp', bgm: 'field_swamp', tplField: 'swamp' };
    if (n >= 513 && n < 600) return { bg: 'city', bgm: 'field_crow' };
    if (n >= 600 && n < 700) return { bg: 'cave', bgm: 'dungeon_deep' };
    return { bg: 'road', bgm: 'field_port' };
  }
  return {
    C: { bg: 'sky', bgm: 'field_sky' },
    F: { bg: 'snow', bgm: 'field_snow', tplField: 'cliff' },
    T: { bg: 'toy', bgm: 'field_toy' },
    M: { bg: 'sea', bgm: 'field_sea', tplField: 'swamp' },
    P: { bg: 'temple', bgm: 'dungeon_temple' },
    D: { bg: 'dragon', bgm: 'field_dragon', tplField: 'forest' },
    H: { bg: 'volcano', bgm: 'field_volcano' },
    E: { bg: 'star', bgm: 'field_star' },
  }[r] || { bg: 'field', bgm: 'field_port' };
}

const ob = (id, name, at) => ({ id, name, at });

export const SPECS = {
  // ===== ブリーズ港まわり =====
  V100: { tpl: 'town', bg: 'port', bgm: 'town_port', w: [3000, 3200] },
  V101: { tpl: 'field', bg: 'beach', layers: 2 },
  V102: { tpl: 'tower', bg: 'lighthouse', layers: 5, rope: 'ladder', w: [1400, 1500],
    secret: { from: 'top', name: '灯台のてっぺん' }, objects: [ob('V102.lamp', '灯台のランプ', 'secret')] },
  V103: { tpl: 'field', bg: 'road', layers: 2 },
  V104: { tpl: 'cliff', bg: 'rock_shore' },
  V105: { tpl: 'cave', bg: 'sea_cave', layers: 3, secret: { from: 'ground-right', name: '海の小部屋' }, objects: [ob('V105.pool', '水たまりの底の小箱', 'secret')] },
  V106: { tpl: 'swamp', bg: 'swamp' },
  V107: { tpl: 'ship', bg: 'ship', bgm: 'town_port' },
  V108: { tpl: 'ship', bg: 'ship_deck', bgm: 'pq' },
  V109: { tpl: 'cliff', bg: 'rock', layers: 3 },
  V090: { tpl: 'town', bg: 'market', bgm: 'market', w: [2600, 2800] },
  V700: { tpl: 'field', bg: 'road', layers: 2 },
  V701: { tpl: 'field', bg: 'road', bgm: 'field_pom', layers: 2 },
  V702: { tpl: 'forest', bg: 'road_forest', bgm: 'field_silva' },
  V703: { tpl: 'forest', bg: 'road_forest', bgm: 'field_silva' },
  V704: { tpl: 'cliff', bg: 'road_rock', bgm: 'field_gard' },
  V705: { tpl: 'field', bg: 'road_dry', bgm: 'field_gard' },
  V706: { tpl: 'swamp', bg: 'swamp', bgm: 'field_swamp' },
  V707: { tpl: 'field', bg: 'crossroad', w: [3400, 3600], layers: 3 },
  V708: { tpl: 'forest', bg: 'forest_dark', bgm: 'field_silva' },
  // ===== ポム丘 =====
  V200: { tpl: 'townHill', bg: 'windmill_town', bgm: 'town_pom', w: [3000, 3200] },
  V201: { tpl: 'field', bg: 'meadow', layers: 1 },
  V202: { tpl: 'field', bg: 'windmill', layers: 3, objects: [ob('V202.bellpig', '鈴の音のするブタっぺ', 'ground-right'), ob('V202.flag', '風車のてっぺんの旗', 'top')] },
  V203: { tpl: 'field', bg: 'flowers' },
  V204: { tpl: 'forest', bg: 'grove' },
  V205: { tpl: 'forest', bg: 'blue_forest' },
  V206: { tpl: 'cave', bg: 'beehive', rope: 'rope' },
  V207: { tpl: 'field', bg: 'farm' },
  V208: { tpl: 'arena', bg: 'mushroom_plaza', bgm: 'boss_mid' },
  V209: { tpl: 'field', bg: 'hill', layers: 3 },
  V210: { tpl: 'field', bg: 'hill', layers: 3 },
  V211: { tpl: 'room', bg: 'training', bgm: 'pq' },
  V212: { tpl: 'cliff', bg: 'hill', objects: [ob('V212.telescope', '見張り小屋の望遠鏡', 'top')] },
  // ===== シルワ森都 =====
  V300: { tpl: 'townTall', bg: 'treetown', bgm: 'town_silva', layers: 3 },
  V301: { tpl: 'forest', objects: [ob('V301.book', '光る本', 'mid')] },
  V302: { tpl: 'swamp', bg: 'pond', objects: [ob('V302.book', '光る本', 'mid')] },
  V303: { tpl: 'forest', objects: [ob('V303.book', '光る本', 'mid')] },
  V304: { tpl: 'forest', bg: 'fairy_grove', layers: 3 },
  V305: { tpl: 'forest', bg: 'vines', layers: 3, objects: [ob('V305.stump', '一番奥の切り株', 'ground-right')] },
  V306: { tpl: 'tower', bg: 'tree_trunk', rope: 'rope', layers: 5 },
  V307: { tpl: 'forest', bg: 'forest_dark' },
  V308: { tpl: 'forest', bg: 'forest_night' },
  V309: { tpl: 'arena', bg: 'great_tree', bgm: 'boss_mid' },
  V310: { tpl: 'room', bg: 'station', bgm: 'town_silva' },
  V311: { tpl: 'room', bg: 'training', bgm: 'pq' },
  V312: { tpl: 'forest', bg: 'branches', layers: 3 },
  // ===== ガルド岩台 =====
  V400: { tpl: 'townTall', bg: 'rock_town', bgm: 'town_gard', layers: 2, rope: 'rope' },
  V401: { tpl: 'field', bg: 'road_dry', layers: 2 },
  V402: { tpl: 'cliff', bg: 'stumps' },
  V403: { tpl: 'field', bg: 'logging' },
  V404: { tpl: 'cliff', bg: 'black_rock' },
  V405: { tpl: 'field', bg: 'valley', layers: 1 },
  V406: { tpl: 'cliff', bg: 'steam_rock' },
  V407: { tpl: 'field', bg: 'ranch', layers: 2 },
  V408: { tpl: 'cave', bg: 'dig', rope: 'ladder', layers: 3 },
  V409: { tpl: 'cave', bg: 'dig', rope: 'ladder', secret: { from: 'ground-left', name: '化石の部屋' },
    objects: [ob('V409.fossil1', '化石（大きな骨）', 'secret'), ob('V409.fossil2', '化石（貝）', 'secret'), ob('V409.fossil3', '化石（羽）', 'secret')] },
  V410: { tpl: 'cave', bg: 'dig', rope: 'ladder' },
  V411: { tpl: 'cave', bg: 'old_battlefield' },
  V412: { tpl: 'arena', bg: 'tomb', bgm: 'boss_mid' },
  V413: { tpl: 'room', bg: 'training', bgm: 'pq' },
  V414: { tpl: 'cliff', bg: 'rock_top', layers: 3 },
  // ===== クロウ街 =====
  V500: { tpl: 'townTall', bg: 'night_city', bgm: 'town_crow', layers: 2, rope: 'ladder', w: [3200, 3400] },
  V501: { tpl: 'field', bg: 'alley', rope: 'ladder' },
  V502: { tpl: 'cave', bg: 'construction', rope: 'ladder' },
  V503: { tpl: 'tower', bg: 'construction', rope: 'ladder', layers: 6, w: [1600, 1800] },
  V504: { tpl: 'tower', bg: 'construction_top', rope: 'rope', layers: 6, w: [1600, 1800], objects: [ob('V504.toolbox', 'てっぺんの道具箱', 'top')] },
  V505: { tpl: 'cave', bg: 'ticket_hall', layers: 2, w: [2000, 2200] },
  V506: { tpl: 'cave', bg: 'subway', rope: 'ladder', layers: 2, secret: { from: 'ground-right', name: '停まった電車の中' }, objects: [ob('V506.lost', '落とし物の包み', 'secret')] },
  V507: { tpl: 'cave', bg: 'subway_dark', rope: 'ladder', layers: 2 },
  V508: { tpl: 'swamp', bg: 'swamp' },
  V509: { tpl: 'swamp', bg: 'swamp' },
  V510: { tpl: 'swamp', bg: 'deep_swamp' },
  V511: { tpl: 'cave', bg: 'sewer', rope: 'ladder', layers: 4 },
  V512: { tpl: 'arena', bg: 'sewer', bgm: 'boss_mid' },
  V513: { tpl: 'room', bg: 'hideout', bgm: 'pq' },
  V514: { tpl: 'townTall', bg: 'rooftops', bgm: 'field_crow', layers: 3, rope: 'ladder', hunting: true },
  V515: { tpl: 'room', bg: 'alley', bgm: 'pq' },
  V516: { tpl: 'rooms', bg: 'alley', bgm: 'pq', rooms: 5 },
  // ===== ねむり谷 =====
  V600: { tpl: 'town', bg: 'valley_village', bgm: 'town_nemuri' },
  V601: { tpl: 'forest', bg: 'forest_dark', bgm: 'field_silva', secret: { from: 'ground-right', name: '大木のうろの研究所' }, objects: [ob('V601.diary', 'ドクの日記', 'secret')] },
  V602: { tpl: 'cave', bg: 'anthill' }, V603: { tpl: 'cave', bg: 'anthill', layers: 4 }, V604: { tpl: 'cave', bg: 'anthill' }, V605: { tpl: 'cave', bg: 'anthill', layers: 4 },
  V606: { tpl: 'arena', bg: 'cave_hall', bgm: 'boss_mid' },
  V607: { tpl: 'cave', bg: 'ice_cave' }, V608: { tpl: 'cliff', bg: 'drake_cave', bgm: 'dungeon_deep' }, V609: { tpl: 'cave', bg: 'drake_cave', layers: 4 },
  V610: { tpl: 'cave', bg: 'red_cave' }, V611: { tpl: 'cave', bg: 'ice_cave' },
  V612: { tpl: 'cave', bg: 'temple_ruin' }, V613: { tpl: 'cave', bg: 'temple_ruin' }, V614: { tpl: 'cave', bg: 'moss_ruin' },
  V615: { tpl: 'field', bg: 'bull_camp', bgm: 'dungeon_deep' }, V616: { tpl: 'tower', bg: 'bull_fort', bgm: 'dungeon_deep', layers: 5, w: [1800, 2000] },
  V617: { tpl: 'cave', bg: 'seal_gate', layers: 2 },
  V618: { tpl: 'arena', bg: 'seal_room', bgm: 'boss_big' },
  V619: { tpl: 'room', bg: 'hot_spring', bgm: 'town_nemuri' },
  V620: { tpl: 'swamp', bg: 'misty_swamp', bgm: 'field_swamp' },

  // ===== セレス =====
  C100: { tpl: 'townTall', bg: 'cloud_city', bgm: 'town_ceres', layers: 3 },
  C101: { tpl: 'room', bg: 'cloud_station', bgm: 'town_ceres', w: [1600, 1800] },
  C102: { tpl: 'field', bg: 'cloud_park' }, C103: { tpl: 'forest', bg: 'star_garden' }, C104: { tpl: 'forest', bg: 'moon_garden' },
  C105: { tpl: 'forest', bg: 'sun_garden' }, C106: { tpl: 'field', bg: 'greenhouse' },
  C107: { tpl: 'tower', bg: 'cloud_tower' }, C108: { tpl: 'tower', bg: 'cloud_tower' }, C109: { tpl: 'tower', bg: 'cloud_tower' },
  C110: { tpl: 'tower', bg: 'cloud_tower' }, C111: { tpl: 'tower', bg: 'cloud_tower' },
  C112: { tpl: 'field', bg: 'cloud_road' }, C113: { tpl: 'cliff', bg: 'pegasus_hill' }, C114: { tpl: 'forest', bg: 'cloud_garden' },
  C115: { tpl: 'field', bg: 'altar_road', layers: 3 },
  C116: { tpl: 'arena', bg: 'cloud_altar', bgm: 'boss_mid' },
  C117: { tpl: 'room', bg: 'goddess_tower_gate', bgm: 'pq' },
  C119: { tpl: 'rooms', bg: 'goddess_tower', bgm: 'pq', rooms: 6 },
  C118: { tpl: 'ship', bg: 'cloud_ship', bgm: 'ship' },
  // ===== ヒョウガ村 =====
  F100: { tpl: 'town', bg: 'snow_village', bgm: 'town_hyoga' },
  F101: { tpl: 'field', bg: 'snowfield' }, F102: { tpl: 'field', bg: 'ice_valley' }, F103: { tpl: 'forest', bg: 'snow_forest' },
  F104: { tpl: 'cave', bg: 'yeti_cave' }, F105: { tpl: 'field', bg: 'snowfield' }, F106: { tpl: 'cliff', bg: 'dark_snow' },
  F107: { tpl: 'cliff', bg: 'snow_peak_road', layers: 3, objects: [ob('F107.sage_stone', '賢者の石', 'ground-left')] },
  F108: { tpl: 'forest', bg: 'snow_forest_night' }, F109: { tpl: 'cliff', bg: 'beast_den' },
  F110: { tpl: 'arena', bg: 'snow_nest', bgm: 'boss_big' },
  F111: { tpl: 'cave', bg: 'mine', bgm: 'dungeon_deep', rope: 'ladder' }, F112: { tpl: 'cave', bg: 'mine', bgm: 'dungeon_deep', rope: 'ladder' },
  F113: { tpl: 'cave', bg: 'mine', bgm: 'dungeon_deep', rope: 'ladder' }, F114: { tpl: 'cave', bg: 'mine', bgm: 'dungeon_deep', rope: 'ladder', layers: 4 },
  F115: { tpl: 'cave', bg: 'mine_deep', bgm: 'dungeon_deep', rope: 'ladder' }, F116: { tpl: 'cave', bg: 'fire_gate', bgm: 'dungeon_deep', layers: 2 },
  F117: { tpl: 'room', bg: 'elder_house', bgm: 'town_hyoga', w: [1400, 1600] },
  F118: { tpl: 'room', bg: 'snow_cave', bgm: 'pq' },
  // ===== ティンクル =====
  T100: { tpl: 'townTall', bg: 'toy_town', bgm: 'town_tinkle', layers: 2, rope: 'ladder' },
  T101: { tpl: 'room', bg: 'toy_station', bgm: 'town_tinkle' },
  T102: { tpl: 'field', bg: 'blocks' }, T103: { tpl: 'field', bg: 'plush_plaza' }, T104: { tpl: 'forest', bg: 'block_garden' },
  T105: { tpl: 'field', bg: 'clock_path' }, T106: { tpl: 'cave', bg: 'screw_storage', rope: 'ladder' }, T107: { tpl: 'cave', bg: 'rocking_horse' },
  T108: { tpl: 'arena', bg: 'block_plaza', bgm: 'boss_mid' },
  T109: { tpl: 'cave', bg: 'toy_factory', rope: 'ladder' }, T110: { tpl: 'cave', bg: 'clock_room' }, T111: { tpl: 'cave', bg: 'toy_factory', rope: 'ladder', layers: 4 },
  T112: { tpl: 'tower', bg: 'time_tower' }, T113: { tpl: 'tower', bg: 'time_tower' }, T114: { tpl: 'tower', bg: 'time_tower' },
  T115: { tpl: 'tower', bg: 'time_tower_deep', objects: [ob('T115.clock', '古い時計', 'top')] },
  T116: { tpl: 'cave', bg: 'time_corridor', layers: 2, w: [3200, 3400] },
  T117: { tpl: 'arena', bg: 'time_gate', bgm: 'boss_big' },
  T118: { tpl: 'room', bg: 'toy_gate', bgm: 'pq' }, T119: { tpl: 'room', bg: 'toy_gate', bgm: 'pq' },
  T121: { tpl: 'rooms', bg: 'clockwork_maze', bgm: 'pq', rooms: 9 },
  T122: { tpl: 'rooms', bg: 'toybox_maze', bgm: 'pq', rooms: 6 },
  T120: { tpl: 'room', bg: 'elevator', bgm: 'field_toy' },
  // ===== マリナ =====
  M100: { tpl: 'townTall', bg: 'bubble_dome', bgm: 'town_marina', layers: 2 },
  M101: {}, M102: { tpl: 'forest', bg: 'coral' }, M103: { tpl: 'cliff', bg: 'crab_rocks' }, M104: { tpl: 'cave', bg: 'octo_cave' },
  M105: {}, M106: { tpl: 'field', bg: 'shark_road' },
  M107: { tpl: 'swamp', bg: 'bone_sea', secret: { from: 'ground-right', name: '大きな骨の口の中' }, objects: [ob('M107.chest', '沈んだ宝箱', 'secret')] },
  M108: { bg: 'dark_sea' }, M109: { bg: 'cold_sea' }, M110: { tpl: 'cave', bg: 'deep_sea' }, M111: { tpl: 'cliff', bg: 'trench' },
  M112: { tpl: 'arena', bg: 'trench_bottom', bgm: 'boss_big' },
  M115: { tpl: 'rooms', bg: 'sunken_ship', bgm: 'pq', rooms: 5 },
  M113: { tpl: 'room', bg: 'sub_dock', bgm: 'town_marina' },
  M114: { tpl: 'room', bg: 'sunken_gate', bgm: 'pq' },
  // ===== 古の神殿 =====
  P100: { tpl: 'town', bg: 'temple_camp', bgm: 'camp', w: [1600, 1800] },
  P101: { tpl: 'cliff', bg: 'temple_stairs', layers: 3 },
  P102: { tpl: 'cave' }, P103: { tpl: 'cave', bg: 'golden_hall' }, P104: { tpl: 'cave', bg: 'knight_hall', layers: 2 },
  P105: { tpl: 'cave', bg: 'prayer_hall' }, P106: { tpl: 'cave', bg: 'golem_hall', layers: 4 }, P107: { tpl: 'tower', bg: 'seal_corridor', w: [1800, 2000] },
  P108: { tpl: 'cave', bg: 'afterimage_hall' },
  P109: { tpl: 'arena', bg: 'temple_altar', bgm: 'boss_big' },
  // ===== 竜の谷 =====
  D100: { tpl: 'townTall', bg: 'dragon_bone_village', bgm: 'town_dragon', layers: 2 },
  D101: { tpl: 'room', bg: 'bird_port', bgm: 'town_dragon' },
  D102: {}, D103: {}, D104: {}, D105: { tpl: 'cliff', bg: 'black_wing_valley' }, D106: { tpl: 'cliff', bg: 'bone_valley' },
  D107: { tpl: 'field', bg: 'sentinel_road' }, D108: { tpl: 'cave', bg: 'chimera_nest' }, D109: { tpl: 'cave', bg: 'fire_nest' },
  D110: { tpl: 'cave', bg: 'ice_nest' }, D111: { tpl: 'cliff', bg: 'thunder_peak', layers: 3 }, D112: { tpl: 'field', bg: 'ancient_road' },
  D113: { tpl: 'cave', bg: 'black_dragon_cave', bgm: 'dungeon_deep', objects: [ob('D113.seal', '封印の石', 'ground-right')] },
  D114: { tpl: 'arena', bg: 'black_dragon_lair', bgm: 'boss_final', w: [2200, 2400] },
  D117: { tpl: 'rooms', bg: 'dragon_nest', bgm: 'pq', rooms: 4 },
  D115: { tpl: 'room', bg: 'dragon_shrine', bgm: 'town_dragon' },
  D116: { tpl: 'room', bg: 'nest_gate', bgm: 'pq' },
  // ===== 焔の坑道 =====
  H100: { tpl: 'town', bg: 'volcano_camp', bgm: 'camp', w: [1800, 2000] },
  H101: { tpl: 'cave', bg: 'lava_road', layers: 2 }, H102: { tpl: 'cave', bg: 'wisp_cave' }, H103: { tpl: 'cave', bg: 'golem_room' },
  H104: { tpl: 'cave', bg: 'ash_barracks', layers: 4 }, H105: { tpl: 'swamp', bg: 'magma_river' },
  H106: { tpl: 'tower', bg: 'colossus_trial', layers: 7, objects: [ob('H106.stele', '奥の石碑', 'top')] },
  H107: { tpl: 'arena', bg: 'fire_altar', bgm: 'boss_big' },
  // ===== 星の果て =====
  E100: { tpl: 'townTall', bg: 'star_tower', bgm: 'camp', layers: 2, rope: 'ladder', w: [1800, 2000] },
  E101: { tpl: 'field', bg: 'stardust_road' }, E102: { tpl: 'cliff', bg: 'ruined_gate' }, E103: { tpl: 'field', bg: 'ruined_avenue', layers: 3 },
  E104: { tpl: 'forest', bg: 'heaven_field' }, E105: { tpl: 'cliff', bg: 'star_abyss' }, E106: { tpl: 'cave', bg: 'apostle_corridor' },
  E107: { tpl: 'cave', bg: 'guardian_hall', layers: 4 },
  E108: { tpl: 'arena', bg: 'star_throne', bgm: 'boss_final', w: [2200, 2400] },
};
