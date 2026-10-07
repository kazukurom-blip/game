// 町と成長の仕組みのデータ（倉庫・店の品ぞろえ・タクシー・ボスの間/1 人用ダンジョン/試験の部屋の決まり・ペット・椅子・製作・
// 賢者の石のクイズ・転職の試験）。export_data.mjs が呼んで、items.json に品を足し、shops.json と systems.json を書き出す。
// 元の設計: ITEMS.md 1・3・4・6 章、WORLD.md 3・4・6 章、QUESTS.md 3・4・6 章、JOBS.md 3 章、MONSTERS.md 5 章、STATS.md 5・6 章、UI.md 5・6 章。
// 設計書に数が無い所は「似」で決めた値（下のコメントに「決めた」と書いた）。名前・文章はすべてオリジナル。

// ---------------- 足す品
// [ID, 名前, タブ, 追加]
export const SYSTEM_ITEMS = [
  // 転職の試験（JOBS.md 3 章）
  ['special.job.recommend', '推薦状', 'special', { quest: true, desc: '2 次の試験官への推薦状' }],
  ['special.job.proof', '試験の証', 'special', { quest: true, desc: '2 次の試験に受かった証。転職官に渡して 2 次の職を選ぶ' }],
  ['special.dark_crystal', '闇の水晶', 'special', { quest: true, desc: '賢者の石に捧げる。クイズを間違えると失う' }],
  // ボスの間の鍵（MONSTERS.md 5 章）
  ['special.key.seal', '封印の鍵', 'special', { quest: true, desc: '封印の間（V618）に入れる' }],
  ['special.key.time', '時の鍵', 'special', { quest: true, desc: '時の門（T117）に入れる' }],
  ['special.key.flame_eye', '焔の目', 'special', { quest: true, desc: '焔の祭壇（H107）に入れる' }],
  ['special.key.black_dragon', '黒竜の洞くつの通行証', 'special', { quest: true, desc: '黒竜の洞くつ 最奥（D114）に入れる' }],
  ['special.key.star_throne', '星の玉座の鍵', 'special', { quest: true, desc: '星の玉座（E108）に入れる' }],
  // 極意の書（4 次の★スキルの上限。成功率は決めた: 20 = 70%、30 = 50%）
  ['use.master_book.20', '極意の書 20', 'use', { price: 0, sellPrice: 5000, masterBook: { cap: 20, rate: 0.7 } }],
  ['use.master_book.30', '極意の書 30', 'use', { price: 0, sellPrice: 10000, masterBook: { cap: 30, rate: 0.5 } }],
  // 乗り物の券（料金の代わりに 1 枚使う）
  ['use.taxi_ticket', 'タクシーの回数券', 'use', { price: 0, sellPrice: 100, ticket: 'taxi' }],
  ['use.ship_ticket', '雲の船の切符', 'use', { price: 0, sellPrice: 250, ticket: 'ship' }],
  // ペット（QUESTS.md 4 章・ITEMS.md 3-5）。ペットの品を使うと迎えられる
  ['use.pet.puppy', '子犬', 'use', { maxStack: 1, price: 10000, sellPrice: 0, pet: 'puppy' }],
  ['use.pet.kitten', '子猫', 'use', { maxStack: 1, price: 10000, sellPrice: 0, pet: 'kitten' }],
  ['use.pet.bunny', '子うさぎ', 'use', { maxStack: 1, price: 10000, sellPrice: 0, pet: 'bunny' }],
  ['use.pet.panda', '子パンダ', 'use', { maxStack: 1, price: 10000, sellPrice: 0, pet: 'panda' }],
  ['use.pet.penguin', '子ペンギン', 'use', { maxStack: 1, price: 10000, sellPrice: 0, pet: 'penguin' }],
  ['use.pet.dragon', '子竜', 'use', { maxStack: 1, price: 0, sellPrice: 0, pet: 'dragon', alias: ['ペット「子竜」'] }],
  ['use.pet_name_tag', 'ペットの名札', 'use', { price: 1000, sellPrice: 0, desc: 'ペットの名前を変える' }],
  ['use.petskill.pickup', 'ペットの技の本「自動で拾う」', 'use', { price: 0, sellPrice: 0, petSkill: 'pickup' }],
  ['use.petskill.range', 'ペットの技の本「拾う範囲を広げる」', 'use', { price: 0, sellPrice: 0, petSkill: 'range' }],
  ['use.petskill.potion', 'ペットの技の本「自動で HP/MP 薬」', 'use', { price: 0, sellPrice: 0, petSkill: 'potion' }],
  // 椅子（設置。座ると HP/MP の回復 1.5 倍。ITEMS.md 3-5）
  ['setup.chair.windmill', '風車の椅子', 'setup', { maxStack: 1, price: 0, sellPrice: 1, chair: { regenMul: 1.5 } }],
  ['setup.chair.pegasus', '天馬の羽の椅子', 'setup', { maxStack: 1, price: 0, sellPrice: 1, chair: { regenMul: 1.5 } }],
  ['setup.chair.cloud', '雲のクッション', 'setup', { maxStack: 1, price: 0, sellPrice: 1, chair: { regenMul: 1.5 } }],
  ['setup.chair.wood', '木の長椅子', 'setup', { maxStack: 1, price: 50000, sellPrice: 1, chair: { regenMul: 1.5 } }],
  // 精錬の板（ITEMS.md 4-2）
  ...[['bronze', '青銅'], ['iron', '鉄'], ['silver', '銀'], ['mithril', 'ミスリル'], ['gold', '金'], ['adaman', 'アダマン'], ['starsteel', '星鉄']]
    .map(([id, nm], i) => [`etc.plate.${id}`, `${nm}の板`, 'etc', { maxStack: 100, price: 0, sellPrice: [150, 250, 400, 1000, 2500, 5000, 25000][i] }]),
  // 宝石（原石 10 → 宝石 1）
  ...['ガーネット', 'アメジスト', 'アクアマリン', 'エメラルド', 'オパール', 'サファイア', 'トパーズ', 'ダイヤモンド', '黒水晶']
    .map((g, i) => [`etc.jewel.${i}`, g, 'etc', { maxStack: 100, price: 0, sellPrice: 2500 + 500 * i }]),
  // 1 人用ダンジョンの試練のメダル（QUESTS.md 6 章。ダンジョンごと）
  ...[['V516', '裏路地'], ['T121', 'からくり'], ['T122', '迷路'], ['C119', '雲'], ['M115', '沈没船'], ['D117', '竜の巣']]
    .map(([m, nm]) => [`etc.medal.${m}`, `試練のメダル（${nm}）`, 'etc', { maxStack: 200, price: 0, sellPrice: 1 }]),
];

/** 1 人用ダンジョンの主 → そのダンジョン（主の固有品「試練のメダル」はダンジョンごとのメダルにする） */
export const MEDAL_OF_MOB = { M068: 'V516', M161: 'T121', M162: 'T122', M118: 'C119', M188: 'M115', M213: 'D117' };

// 製作の装備（ITEMS.md 4-3 の例。攻撃力付きの手袋）
export function craftedEquips(items) {
  const base = items.find((i) => i.id === 'eq.warrior.gloves.50');
  return [{
    id: 'eq.craft.mithril_gauntlet', name: 'ミスリルの小手', tab: 'equip', maxStack: 1, slot: 'gloves', job: 'warrior', reqLevel: 50,
    reqStat: base?.reqStat, reqValue: base?.reqValue, stats: { ...(base?.stats || { wdef: 30 }), watk: 2 }, upgrades: base?.upgrades ?? 5, price: 0, sellPrice: 6000,
    desc: '製作（鍛冶屋カジ）',
  }];
}

// ---------------- 店（ITEMS.md 6 章）
const ALL = ['warrior', 'magician', 'bowman', 'thief', 'pirate'];
const RETURN_V = ['V100', 'V200', 'V300', 'V400', 'V500', 'V600'].map((m) => `use.return.${m}`);
const CURE = ['use.antidote', 'use.eye_drop', 'use.holy_water', 'use.all_cure'];
// 町ごとの武器屋・防具屋。jobs と Lv の範囲で items.json の装備から選ぶ（Lv100・110 は売らない）
export const TOWN_SHOPS = {
  V100: { weapon: { npc: 'jan', jobs: ALL, lv: [10, 15] }, armor: { npc: 'mire', jobs: ALL, lv: [10, 15] } },
  V200: { weapon: { npc: 'toma', jobs: ['bowman'], lv: [10, 35], extra: ['use.arrow_bow', 'use.arrow_xbow', 'use.bronze_arrow_bow', 'use.bronze_arrow_xbow'] },
    armor: { npc: 'lana', jobs: ['bowman'], lv: [10, 35] } },
  V300: { weapon: { npc: 'mint', jobs: ['magician'], lv: [8, 35] }, armor: { npc: 'fio', jobs: ['magician'], lv: [10, 35], shields: [30] } },
  V400: { weapon: { npc: 'gantetsu', jobs: ['warrior'], lv: [10, 35] }, armor: { npc: 'hagane', jobs: ['warrior'], lv: [10, 35], shields: [10, 20, 30] } },
  V500: { weapon: { npc: 'sue', jobs: ['thief'], lv: [10, 35], extra: ['use.star_iron', 'use.star_steel', 'use.star_silver_moon'], recharge: true },
    armor: { npc: 'kuroe', jobs: ['thief'], lv: [10, 35], shields: [20] } },
  V107: { weapon: { npc: 'battsu', jobs: ['pirate'], lv: [10, 35], extra: ['use.bullet_lead', 'use.bullet_steel'], recharge: true },
    armor: { npc: 'hose', jobs: ['pirate'], lv: [10, 35] } },
  C100: { weapon: { npc: 'kumo', jobs: ALL, lv: [40, 50], extra: ['use.arrow_bow', 'use.arrow_xbow', 'use.steel_arrow_bow', 'use.steel_arrow_xbow', 'use.star_iron', 'use.bullet_lead'] },
    armor: { npc: 'shiro', jobs: ALL, lv: [40, 50], capes: [30, 50] } },
  F100: { weapon: { npc: 'tsurara', jobs: ALL, lv: [50, 60], extra: ['use.arrow_bow', 'use.arrow_xbow', 'use.star_iron', 'use.bullet_lead'] }, armor: { npc: 'mofu', jobs: ALL, lv: [50, 60] } },
  T100: { weapon: { npc: 'zenmai', jobs: ALL, lv: [40, 60], extra: ['use.arrow_bow', 'use.arrow_xbow', 'use.steel_arrow_bow', 'use.steel_arrow_xbow', 'use.star_iron', 'use.bullet_lead'] },
    armor: { npc: 'wata', jobs: ALL, lv: [40, 60], earrings: [35, 55] } },
  M100: { weapon: { npc: 'sango', jobs: ALL, lv: [60, 70], extra: ['use.arrow_bow', 'use.arrow_xbow', 'use.star_iron', 'use.bullet_lead'] }, armor: { npc: 'kai_m', jobs: ALL, lv: [60, 70] } },
  D100: { weapon: { npc: 'uroko', jobs: ALL, lv: [70, 90], extra: ['use.arrow_bow', 'use.arrow_xbow', 'use.star_iron', 'use.bullet_lead'] },
    armor: { npc: 'hone', jobs: ALL, lv: [70, 90], capes: [70, 90] } },
};

// 薬屋・雑貨（ITEMS.md 6 章の「薬屋・雑貨」の列。薬は地域の Lv に合わせ、解毒薬などは全部の町）
export const GENERAL_SHOPS = {
  V100: ['use.red_potion', 'use.orange_potion', 'use.white_potion', 'use.blue_potion', 'use.mana_elixir', 'use.speed_tonic', ...CURE, ...RETURN_V, 'use.return.nearest', 'use.safety_charm'],
  V107: ['use.red_potion', 'use.orange_potion', 'use.white_potion', 'use.blue_potion', 'use.mana_elixir', ...CURE],
  V200: ['use.red_potion', 'use.orange_potion', 'use.white_potion', 'use.blue_potion', 'use.mana_elixir', 'use.aim_tonic', 'use.baked_apple', ...CURE],
  V300: ['use.red_potion', 'use.orange_potion', 'use.white_potion', 'use.blue_potion', 'use.mana_elixir', 'use.magic_tonic', 'use.nut_soup', ...CURE],
  V400: ['use.red_potion', 'use.orange_potion', 'use.white_potion', 'use.blue_potion', 'use.mana_elixir', 'use.power_tonic', ...CURE],
  V500: ['use.red_potion', 'use.orange_potion', 'use.white_potion', 'use.blue_potion', 'use.mana_elixir', 'use.dodge_tonic', ...CURE],
  V600: ['use.orange_potion', 'use.white_potion', 'use.blue_potion', 'use.mana_elixir', ...CURE],
  C100: ['use.orange_potion', 'use.white_potion', 'use.big_white_potion', 'use.blue_potion', 'use.mana_elixir', ...CURE, 'use.return.C100', 'use.return.nearest'],
  F100: ['use.white_potion', 'use.big_white_potion', 'use.blue_potion', 'use.mana_elixir', 'use.warm_milk', 'use.star_snow', ...CURE, 'use.return.F100', 'use.return.nearest'],
  T100: ['use.orange_potion', 'use.white_potion', 'use.big_white_potion', 'use.blue_potion', 'use.mana_elixir', ...CURE, 'use.return.T100', 'use.return.nearest'],
  M100: ['use.white_potion', 'use.big_white_potion', 'use.mana_elixir', 'use.seaweed_dango', ...CURE, 'use.return.M100', 'use.return.nearest'],
  P100: ['use.big_white_potion', 'use.xl_potion', 'use.mana_elixir', 'use.blue_secret', ...CURE, 'use.return.P100'],
  D100: ['use.big_white_potion', 'use.xl_potion', 'use.mana_elixir', 'use.blue_secret', ...CURE, 'use.return.D100', 'use.return.nearest'],
  H100: ['use.xl_potion', 'use.blue_secret', ...CURE, 'use.return.H100'],
  E100: ['use.xl_potion', 'use.blue_secret', ...CURE, 'use.return.E100'],
};

// そのほかの店（NPC の ID → 店）
export const OTHER_SHOPS = [
  { id: 'shop.V600.general', npc: 'koro', name: 'ねむり谷の雑貨屋', items: [...RETURN_V, 'use.return.nearest', 'use.safety_charm', 'use.red_potion', 'use.blue_potion'] },
  { id: 'shop.V200.pet', npc: 'chiko', name: 'ペット屋', items: ['use.pet.puppy', 'use.pet.kitten', 'use.pet.bunny', 'use.pet.panda', 'use.pet.penguin', 'use.pet_food', 'use.pet_name_tag'] },
  { id: 'shop.V090.furniture', npc: 'mate', name: '素材屋の家具の棚', items: ['setup.chair.wood'] },
];

// にぎわい市場の日替わり（WORLD.md 3-8）。pick 個を 1 日ごとに選ぶ（種は日付と店の ID）。priceMul は決めた値
export const DAILY_SHOPS = [
  { id: 'shop.V090.used', npc: 'horn', name: '古道具屋（日替わりの中古の装備）', pick: 8, priceMul: 0.7, pool: { equip: true, lv: [10, 70] } },
  { id: 'shop.V090.scroll', npc: 'scri', name: '書の行商人（日替わりの書）', pick: 5, pool: { scroll: [60, 100] }, price: { 60: 30000, 100: 20000 } },
];

// ---------------- タクシー（WORLD.md 4 章: ヴェルデ大陸の 5 町 ＋ ねむり谷、800〜1,500、初心者 1/10）
export const TAXI_TOWNS = ['V100', 'V200', 'V300', 'V400', 'V500', 'V600'];
export const TAXI_DRIVERS = { V100: 'marco', V200: 'taxi_pom', V300: 'taxi_silva', V400: 'taxi_gard', V500: 'taxi_crow', V600: 'taxi_nemu' };
export function taxiOf(from) {
  const i = TAXI_TOWNS.indexOf(from);
  // 料金は町の並びの離れ具合で 800〜1,500（決めた値: 800 ＋ 140 × (離れ − 1)）
  return { dests: TAXI_TOWNS.filter((m) => m !== from).map((m) => ({ to: m, toPortal: 'town', fee: 800 + 140 * (Math.abs(TAXI_TOWNS.indexOf(m) - i) - 1) })), beginnerDiv: 10 };
}

// ---------------- 倉庫（ITEMS.md 1 章・UI.md 6 章）
export const STORAGE = { startSlots: 16, maxSlots: 48, step: 4, expandBase: 10000, fee: 100, shared: true };

// ---------------- ボスの間・1 人用ダンジョン・試験の部屋の決まり（MONSTERS.md 5 章・QUESTS.md 6 章・JOBS.md 3 章）
// kind: boss（ボスの間）/ dungeon（1 人用ダンジョン）/ test（転職の試験の部屋）
// perDay: 1 日に入れる回数（period: 'week' なら 7 日で）/ timeSec: 制限時間 / exit: 倒れた時・時間切れの戻り先 / fresh: 入るたびに作り直す（ボスがすぐ出る）
// requiresItem / requiresQuest（完了）/ requiresAnyQuest（進行中）/ timerQuest: そのクエストの間だけ時間を数える / resetItems: 失敗・外に出た時に消す品
// clearMob: 倒すとクリア（dungeon_clear）/ medal: クリアでもらうメダル
const BOSS_DEFAULT_SEC = 30 * 60; // 制限時間の書いていないボスの間（決めた値）
export const ROOMS = [
  { map: 'V309', kind: 'boss', perDay: 3, timeSec: BOSS_DEFAULT_SEC, exit: 'V307', requiresQuest: 'W-15', fresh: true },
  { map: 'V412', kind: 'boss', perDay: 3, timeSec: BOSS_DEFAULT_SEC, exit: 'V411', fresh: true },
  { map: 'V512', kind: 'boss', perDay: 3, timeSec: BOSS_DEFAULT_SEC, exit: 'V511', fresh: true },
  { map: 'V618', kind: 'boss', perDay: 2, timeSec: BOSS_DEFAULT_SEC, exit: 'V617', requiresItem: 'special.key.seal', fresh: true },
  { map: 'C116', kind: 'boss', perDay: 2, timeSec: BOSS_DEFAULT_SEC, exit: 'C115', fresh: true },
  { map: 'F110', kind: 'boss', perDay: 2, timeSec: BOSS_DEFAULT_SEC, exit: 'F109', fresh: true },
  { map: 'T117', kind: 'boss', perDay: 2, timeSec: 20 * 60, exit: 'T116', requiresItem: 'special.key.time', fresh: true },
  { map: 'M112', kind: 'boss', perDay: 2, timeSec: 20 * 60, exit: 'M111', fresh: true },
  { map: 'P109', kind: 'boss', perDay: 2, timeSec: 25 * 60, exit: 'P108', fresh: true },
  { map: 'H107', kind: 'boss', perDay: 1, timeSec: 45 * 60, exit: 'H106', requiresItem: 'special.key.flame_eye', fresh: true },
  { map: 'D114', kind: 'boss', perDay: 1, period: 'week', timeSec: 60 * 60, exit: 'D113', requiresItem: 'special.key.black_dragon', fresh: true },
  { map: 'E108', kind: 'boss', perDay: 1, period: 'week', timeSec: 60 * 60, exit: 'E107', requiresItem: 'special.key.star_throne', fresh: true },
  // 1 人用ダンジョン（1 日 5 回・入れる Lv・制限時間）
  { map: 'V516', kind: 'dungeon', perDay: 5, timeSec: 20 * 60, exit: 'V515', lv: [21, 30], clearMob: 'M068', medal: 'etc.medal.V516', fresh: true },
  { map: 'T121', kind: 'dungeon', perDay: 5, timeSec: 30 * 60, exit: 'T118', lv: [35, 50], clearMob: 'M161', medal: 'etc.medal.T121', fresh: true },
  { map: 'T122', kind: 'dungeon', perDay: 5, timeSec: 15 * 60, exit: 'T119', lv: [51, 70], clearMob: 'M162', medal: 'etc.medal.T122', fresh: true },
  { map: 'C119', kind: 'dungeon', perDay: 5, timeSec: 45 * 60, exit: 'C117', lv: [51, 70], clearMob: 'M118', medal: 'etc.medal.C119', fresh: true },
  { map: 'M115', kind: 'dungeon', perDay: 5, timeSec: 30 * 60, exit: 'M114', lv: [70, 90], clearMob: 'M188', medal: 'etc.medal.M115', fresh: true },
  { map: 'D117', kind: 'dungeon', perDay: 5, timeSec: 30 * 60, exit: 'D116', lv: [100, 120], clearMob: 'M213', medal: 'etc.medal.D117', fresh: true },
  // 2 次の試験（修練場。試しの珠 30 個・20 分。時間切れや外に出るとやり直し）
  ...[['V413', 'V400', 'J1-3'], ['V311', 'V300', 'J2-3'], ['V211', 'V200', 'J3-3'], ['V513', 'V500', 'J4-3'], ['V108', 'V107', 'J5-3']]
    .map(([map, exit, q]) => ({ map, kind: 'test', timeSec: 20 * 60, exit, timerQuest: q, resetItems: ['etc.M301'] })),
  // 3 次の試験「次元の扉」: もう一人の自分と戦う部屋（試験の間だけ入れる・20 分）
  { map: 'F118', kind: 'test', timeSec: 20 * 60, exit: 'F117', requiresAnyQuest: ['J1-6', 'J2-6', 'J3-6', 'J4-6', 'J5-6'], timerQuest: 'any', fresh: true },
];

// ---------------- ペット（QUESTS.md 4 章）。数は決めた値
export const PETS = {
  kinds: [
    { id: 'puppy', name: '子犬' }, { id: 'kitten', name: '子猫' }, { id: 'bunny', name: '子うさぎ' },
    { id: 'panda', name: '子パンダ' }, { id: 'penguin', name: '子ペンギン' }, { id: 'dragon', name: '子竜', grownName: '竜', growAt: 30 },
  ],
  fullnessMax: 100, hungerSec: 36,          // 満腹度は 36 秒で 1 減る（100 → 0 で 1 時間）
  foodItem: 'use.pet_food', foodFullness: 30, // ペットの餌 +30（ITEMS.md 3-5）
  closenessMax: 30, pointsPerLevel: 3,        // 親密度 Lv n → n+1 に 3n 点（Lv10 = 135 点、Lv30 = 1,305 点）
  feedPoints: 3, trickPoints: 1, trickChance: 0.6, trickCooldown: 10,
  walkPointSec: 300,                          // 満腹度 50 以上で連れて歩くと 5 分ごとに +1
  starvePenaltySec: 600,                      // 満腹度 0 のまま 10 分ごとに −1
  pickupRange: 80, pickupRangeWide: 200, pickupInterval: 0.2,
  potionHpPct: 0.5, potionMpPct: 0.3,         // 自動で薬（UI.md の設定で変える。初めの値）
  followGap: 36,
  tricks: ['お座り', 'お手', 'ふせ', 'くるりと回る', 'ジャンプ', '寝たふり'], // 親密度 5 ごとに 1 つ増える
};

// ---------------- 製作（ITEMS.md 4-2・4-3。NPC ごと）
const ORE_PLATES = [['bronze', 300], ['iron', 500], ['silver', 800], ['mithril', 2000]];
export const CRAFTS = [
  ...ORE_PLATES.map(([o, fee]) => ({ id: `refine.${o}`, npc: 'kaji', in: [{ item: `etc.ore.${o}`, count: 10 }], fee, out: { item: `etc.plate.${o}`, count: 1 } })),
  { id: 'craft.mithril_gauntlet', npc: 'kaji', in: [{ item: 'etc.plate.mithril', count: 5 }, { item: 'etc.M079', count: 30 }], fee: 30000, out: { item: 'eq.craft.mithril_gauntlet', count: 1 } },
  ...Array.from({ length: 9 }, (_, i) => ({ id: `gem.${i}`, npc: 'nez', in: [{ item: `etc.gem.${i}`, count: 10 }], fee: 500 + 500 * i + (i === 8 ? 500 : 0), out: { item: `etc.jewel.${i}`, count: 1 } })),
  ...[['gold', 5000], ['adaman', 8000]].map(([o, fee]) => ({ id: `refine.${o}`, npc: 'tsurara', in: [{ item: `etc.ore.${o}`, count: 10 }], fee, out: { item: `etc.plate.${o}`, count: 1 } })),
  { id: 'refine.starsteel', npc: 'doran', in: [{ item: 'etc.ore.starsteel', count: 10 }], fee: 50000, out: { item: 'etc.plate.starsteel', count: 1 } },
  // 闇の水晶は「素材から作る」こともできる（JOBS.md 3-3）: 黒水晶 1・黒い石 10
  { id: 'craft.dark_crystal', npc: 'jue', in: [{ item: 'etc.jewel.8', count: 1 }, { item: 'etc.M079', count: 10 }], fee: 10000, out: { item: 'special.dark_crystal', count: 1 } },
];

// ---------------- 毎日の宝箱（WORLD.md 6 章: 「1 日 1 回」）。中身は決めた値（その場所の Lv の敵のお金 × 20 と薬）
export const DAILY_CHESTS = { 'T104.toybox': { mesoMul: 20 }, 'M107.chest': { mesoMul: 20 } };

// ---------------- 転職（JOBS.md 3 章・QUESTS.md 3 章）
export const JOB_TESTS = {
  lines: { warrior: 'J1', magician: 'J2', bowman: 'J3', thief: 'J4', pirate: 'J5' },
  tier2: { level: 30, proof: 'special.job.proof' },
  quiz: { count: 5, needItems: ['etc.M300', 'special.dark_crystal'], loseOnWrong: 'special.dark_crystal', stone: 'F107.sage_stone' },
  // 試験の間は必ず落とす（紅の印・蒼の印）
  questDrops: ALL.flatMap((_, k) => [
    { quest: `J${k + 1}-9`, mob: 'M211', item: 'etc.M211' }, { quest: `J${k + 1}-9`, mob: 'M212', item: 'etc.M212' },
  ]),
  inventoryPlus: 4,
  // 1 次転職でもらう物（JOBS.md 3-1 の「もらえる物」）。数は束の数ではなく個数。投げ星 ×800 ×3 は 2400 個（1 枠 500 個）
  firstJobItems: {
    warrior: [{ item: 'eq.warrior.sword1.10', count: 1 }, { item: 'use.red_potion', count: 20 }],
    magician: [{ item: 'eq.magician.wand.8', count: 1 }, { item: 'use.blue_potion', count: 20 }],
    bowman: [{ item: 'eq.bowman.bow.10', count: 1 }, { item: 'use.arrow_bow', count: 2000 }],
    thief: [{ item: 'eq.thief.claw.10', count: 1 }, { item: 'use.star_iron', count: 2400 }],
    pirate: [{ item: 'eq.pirate.knuckle.10', count: 1 }, { item: 'eq.pirate.gun.10', count: 1 }, { item: 'use.bullet_lead', count: 800 }],
  },
};

// ---------------- 賢者の石のクイズ（30 問から 5 問。答えは choices の何番目か）。このゲームの知識を問うオリジナルの問題
export const QUIZ = [
  ['浜で目を覚ました主人公を村へ案内してくれた少年は？', ['案内人ルカ', '漁師トビオ', '教官バルド', '船長カイ'], 0],
  ['芽吹きの島から大陸へ渡る船が出る所は？', ['旅立ちの桟橋', 'しずくの洞窟', 'スライムの泉', '村の訓練所'], 0],
  ['大陸に着いた旅人が最初に降りる港町は？', ['ブリーズ港', 'マリナ', 'クロウ街', 'セレス'], 0],
  ['弓使いの転職官がいる、風車の町は？', ['ポム丘', 'ガルド岩台', 'シルワ森都', 'ねむり谷'], 0],
  ['大木の上にある魔法使いの町は？', ['シルワ森都', 'ティンクル', 'ポム丘', 'セレス'], 0],
  ['戦士の転職官の名前は？', ['戦士長ドルガ', '大魔導師オルフェ', '影の頭領ヤミ', '弓の師範エルナ'], 0],
  ['盗賊の町クロウ街の地下を走っている物は？', ['地下鉄', '雲の船', '潜水船', 'そり'], 0],
  ['海賊の転職官キャプテン・リオがいる船の名前は？', ['潮風号', '雲の船', '沈没船', '竜の背'], 0],
  ['2 次の転職の試験で 30 個集める物は？', ['試しの珠', '黒いお守り', '紅の印', '闇の水晶'], 0],
  ['1 次の転職ができる Lv（魔法使いを除く）は？', ['10', '8', '15', '30'], 0],
  ['魔法使いは Lv いくつから転職できる？', ['8', '10', '12', '5'], 0],
  ['3 次の転職ができる Lv は？', ['70', '50', '60', '100'], 0],
  ['ペットの満腹度を増やす物は？', ['ペットの餌', '赤ポーション', '帰還の書', '強化の書'], 0],
  ['倉庫に出し入れするといくらかかる？', ['100 ルド', '無料', '1,000 ルド', '10 ルド'], 0],
  ['死んだ時に経験値を失わずにすむ品は？', ['守りのお守り', '万能薬', '聖水', '持ち物の袋'], 0],
  ['毒を治す薬は？', ['解毒薬', '目薬', '聖水', '温かい乳'], 0],
  ['雲の上の白い町の名前は？', ['セレス', 'ヒョウガ村', 'ティンクル', 'マリナ'], 0],
  ['3 次の転職の長老たちが住む、雪山の村は？', ['ヒョウガ村', 'ねむり谷', '竜の背の村', 'ポム丘'], 0],
  ['おもちゃ箱の中のような町は？', ['ティンクル', 'マリナ', 'クロウ街', 'セレス'], 0],
  ['海の底の泡のドームの町は？', ['マリナ', 'ティンクル', 'ブリーズ港', 'ガルド岩台'], 0],
  ['4 次の転職を授ける竜の大老の名前は？', ['ヴァルド', 'グレン', 'アストラ', 'ガロン'], 0],
  ['「もう一人の自分」と戦う部屋がある所は？', ['修験の雪洞', '雲の祭壇', '時の門', '封印の間'], 0],
  ['キノコの女王が出る広場は？', ['キノコの広場', '積み木の広場', '地下の広間', '溝の底'], 0],
  ['書の成功率で、失敗すると装備が壊れることがあるのは？', ['呪いの書', '100% の書', '60% の書', '10% の書'], 0],
  ['盗賊の回避の上限は？', ['80%', '30%', '50%', '100%'], 0],
  ['町の中で立ち止まると、HP が回復する間隔は？', ['5 秒ごと', '10 秒ごと', '1 秒ごと', '60 秒ごと'], 0],
  ['椅子に座ると自然回復はどうなる？', ['1.5 倍になる', '止まる', '半分になる', '変わらない'], 0],
  ['にぎわい市場で、日替わりの依頼を出しているのは？', ['掲示板係ボード', '古道具屋ホルン', '宝石商ジュエ', '占い師ヨミ'], 0],
  ['セレスとヒョウガ村の間を結ぶ乗り物は？', ['タクシー（そり）', '潜水船', '大きな鳥', '昇降機'], 0],
  ['最後の地域「星の果て」の玉座にいるのは？', ['星を呑む者', '三つ首の黒竜', '焔の巨像', '時計塔の魔物'], 0],
].map(([q, choices, answer], i) => ({ id: `q${i + 1}`, q, choices, answer }));
