// NPC の一覧（WORLD.md 3 章の町の顔ぶれ＋クエストの依頼者・相手）。名前はすべてオリジナル。
// 列: [ID, 名前, マップ, 追加]
//   追加: x（島だけ手で置く。ほかは生成器が足場の上に並べる）/ tier（0 = 地面、1〜 = 上の段。高い町で上の段に置く）
//         shop（店の ID。武器屋・防具屋などは systems.mjs の品ぞろえから export_data.mjs が付ける）/ inn（宿屋の料金）/ travel（乗り物）
//         taxi（タクシー: 行き先の一覧と料金。systems.mjs）/ role（weapon・armor・potion・storage・taxi・guide など。絵や会話の手がかり）
// 同じ人が別のマップにもいる時（転職官が修練場にいる など）は ID に _<マップ> を付けた別の NPC にする（名前は同じ）。
import { taxiOf } from '../systems.mjs';

// homeward: 帰りの便（大陸の方へ戻る）。お金が足りない時は有り金だけで乗せてくれる（乗り物でしか出入りできない地域で詰まないように）
const TRV = (to, o = {}) => ({ travel: { to, toPortal: 'sp', minLevel: 0, oneWay: false, fee: 0, ...o } });

export const NPCS = [
  // ===== 芽吹きの島 =====
  ['luka', '案内人ルカ', 'S000', { x: 260 }],
  ['ganzo', '縄職人ガンゾ', 'S001', { x: 560 }],
  ['poppo', 'はしご番のポッポ', 'S002', { x: 300 }],
  ['yomogi', '村長ヨモギ', 'S003', { x: 1180 }],
  ['tata', '雑貨屋タタ', 'S003', { x: 620, shop: 'shop.S003.general' }],
  ['nina', '薬屋ニナ', 'S003', { x: 820, shop: 'shop.S003.potion' }],
  ['momo', '宿屋のモモ', 'S003', { x: 1450, inn: 30 }],
  ['tobio', '漁師トビオ', 'S003', { x: 1720 }],
  ['riri', '少女リリ', 'S003', { x: 1900 }],
  ['gen', 'ゲン爺', 'S003', { x: 1320 }],
  ['piko', '学者見習いピコ', 'S003', { x: 2000 }],
  ['luka_S003', '案内人ルカ', 'S003', { x: 1060 }],
  ['baldo', '教官バルド', 'S011', { x: 500 }],
  ['kai', '船長カイ', 'S010', { x: 900, ...TRV('V100', { minLevel: 7, oneWay: true, requiresQuest: 'S-19' }) }],

  // ===== ブリーズ港 =====
  ['olga', '港長オルガ', 'V100', { role: 'guide' }],
  ['jan', '武器屋ジャン', 'V100', { role: 'weapon' }],
  ['mire', '防具屋ミレ', 'V100', { role: 'armor' }],
  ['pola', '薬屋ポーラ', 'V100', { role: 'potion', shop: 'shop.V100.potion' }],
  ['dan', '倉庫番ダン', 'V100', { role: 'storage' }],
  ['marco', 'タクシーの運転手マルコ', 'V100', { role: 'taxi', taxi: taxiOf('V100') }],
  ['rokko', '船乗りロッコ', 'V100'],
  ['uo', '釣り好きのウオ爺', 'V100'],
  ['ichiba', '市場の案内人', 'V100', { role: 'guide' }],
  ['minato', '潜水船の係ミナト', 'V100', TRV('M113', { fee: 1500, minLevel: 40 })],
  ['sol', '灯台守ソル', 'V102'],
  ['rio', 'キャプテン・リオ', 'V107', { role: 'job' }],
  ['battsu', '砲手バッツ', 'V107', { role: 'weapon' }],
  ['guri', '料理人グリ', 'V107', { role: 'potion', shop: 'shop.V107.potion' }],
  ['hose', '帆縫いのホセ', 'V107', { role: 'armor' }],
  ['rio_V108', 'キャプテン・リオ', 'V108', { role: 'job' }],

  // ===== にぎわい市場 =====
  ['horn', '古道具屋ホルン', 'V090', { role: 'weapon' }],
  ['scri', '書の行商人スクリ', 'V090'],
  ['jue', '宝石商ジュエ', 'V090', { role: 'craft' }],
  ['mate', '素材屋マテ', 'V090'],
  ['board', '掲示板係ボード', 'V090'],
  ['yomi', '占い師ヨミ', 'V090'],

  // ===== ポム丘 =====
  ['erna', '弓の師範エルナ', 'V200', { role: 'job' }],
  ['toma', '弓の武器屋トマ', 'V200', { role: 'weapon' }],
  ['lana', '防具屋ラナ', 'V200', { role: 'armor' }],
  ['popo', '薬屋ポポ', 'V200', { role: 'potion', shop: 'shop.V200.potion' }],
  ['chiko', 'ペット屋チコ', 'V200', { role: 'pet' }],
  ['hako', '倉庫番ハコ', 'V200', { role: 'storage' }],
  ['bob', '風車守ボブ', 'V200', { tier: 1 }],
  ['marsa', '農家のマーサ', 'V200'],
  ['sui', '花売りのスイ', 'V200'],
  ['taro', '牧場の少年タロ', 'V200'],
  ['taxi_pom', 'タクシーの運転手ピピ', 'V200', { role: 'taxi', taxi: taxiOf('V200') }],
  ['erna_V211', '弓の師範エルナ', 'V211', { role: 'job' }],
  ['fin', '試験官フィン', 'V211'],

  // ===== シルワ森都（木の上の町: 上の段ほど店が多い） =====
  ['orfe', '大魔導師オルフェ', 'V300', { role: 'job', tier: 2 }],
  ['mint', '魔法の武器屋ミント', 'V300', { role: 'weapon', tier: 1 }],
  ['fio', 'ローブ屋フィオ', 'V300', { role: 'armor', tier: 1 }],
  ['herb', '薬草屋ハーブ', 'V300', { role: 'potion', shop: 'shop.V300.potion', tier: 1 }],
  ['kura', '倉庫番クラ', 'V300', { role: 'storage', tier: 1 }],
  ['libra', '司書リブラ', 'V300', { tier: 2 }],
  ['tia', '妖精の使いティア', 'V300', { tier: 2 }],
  ['wood', '木こりの青年ウッド', 'V300'],
  ['taxi_silva', 'タクシーの運転手リーフ', 'V300', { role: 'taxi', taxi: taxiOf('V300') }],
  ['noa', '駅員ノア', 'V310', TRV('C101', { fee: 1000, minLevel: 20 })],
  ['orfe_V311', '大魔導師オルフェ', 'V311', { role: 'job' }],
  ['sera', '試験官セラ', 'V311'],

  // ===== ガルド岩台 =====
  ['dorga', '戦士長ドルガ', 'V400', { role: 'job', tier: 1 }],
  ['gantetsu', '武器屋ガンテツ', 'V400', { role: 'weapon' }],
  ['hagane', '防具屋ハガネ', 'V400', { role: 'armor' }],
  ['ginger', '薬屋ジンジャー', 'V400', { role: 'potion', shop: 'shop.V400.potion' }],
  ['iwa', '倉庫番イワ', 'V400', { role: 'storage' }],
  ['rossi', '発掘隊長ロッシ', 'V400'],
  ['toto', '祈祷師トト', 'V400', { tier: 1 }],
  ['kaji', '鍛冶屋カジ', 'V400', { role: 'craft' }],
  ['taxi_gard', 'タクシーの運転手ガタ', 'V400', { role: 'taxi', taxi: taxiOf('V400') }],
  ['dorga_V413', '戦士長ドルガ', 'V413', { role: 'job' }],
  ['block', '試験官ブロック', 'V413'],

  // ===== クロウ街 =====
  ['yami', '影の頭領ヤミ', 'V500', { role: 'job', tier: 1 }],
  ['sue', 'ナイフ屋スー', 'V500', { role: 'weapon' }],
  ['kuroe', '防具屋クロエ', 'V500', { role: 'armor' }],
  ['kusuri', '薬屋クスリ', 'V500', { role: 'potion', shop: 'shop.V500.potion' }],
  ['kinko', '倉庫番キンコ', 'V500', { role: 'storage' }],
  ['tetsu', '駅員テツ', 'V500'],
  ['bolt', '工事の親方ボルト', 'V500'],
  ['nez', '情報屋ネズ', 'V500', { tier: 1, role: 'craft' }],
  ['taxi_crow', 'タクシーの運転手ネオ', 'V500', { role: 'taxi', taxi: taxiOf('V500') }],
  ['yami_V513', '影の頭領ヤミ', 'V513', { role: 'job' }],
  ['jill', '試験官ジル', 'V513'],
  ['rat', '受付ラット', 'V515'],
  ['kago', '荷物番のカゴ', 'V707'],

  // ===== ねむり谷 =====
  ['nemu', '宿屋のネム', 'V600', { inn: 100 }],
  ['mayu', '薬屋のマユ', 'V600', { role: 'potion', shop: 'shop.V600.potion' }],
  ['koro', '雑貨屋のコロ', 'V600', { role: 'general' }],
  ['yuu', '温泉番ユウ', 'V600'],
  ['sig', '封印の番人シグ', 'V600'],
  ['doc', '学者ドク', 'V600'],
  ['nagi', '倉庫番ナギ', 'V600', { role: 'storage' }],
  ['taxi_nemu', 'タクシーの運転手ウトウ', 'V600', { role: 'taxi', taxi: taxiOf('V600') }],

  // ===== セレス =====
  ['stella', '都の巫女ステラ', 'C100', { tier: 1 }],
  ['hana', '庭師ハナ', 'C100'],
  ['xeno', '塔の魔導師ゼノ', 'C100', { tier: 1 }],
  ['kumo', '武器屋クモ', 'C100', { role: 'weapon' }],
  ['shiro', '防具屋シロ', 'C100', { role: 'armor' }],
  ['hikari', '薬屋ヒカリ', 'C100', { role: 'potion', shop: 'shop.C100.potion' }],
  ['tsumu', '倉庫番ツム', 'C100', { role: 'storage' }],
  ['ceres_taxi', 'タクシーの運転手フワ', 'C100', TRV('F100', { fee: 2000, minLevel: 40 })],
  ['luna', '駅員ルナ', 'C101', TRV('V310', { fee: 1000, homeward: true })],
  ['sora', 'ティンクル行きの係ソラ', 'C101', TRV('T101', { fee: 1000 })],
  ['hashi', '天の階段の船頭', 'C101', TRV('P100', { fee: 2000, minLevel: 80 })],
  ['tsubasa', '大きな鳥の係ツバサ', 'C101', TRV('D101', { fee: 3000, minLevel: 90 })],
  ['nefe', '受付ネフェ', 'C117'],
  ['kaze', '雲の船の水夫カゼ', 'C118', TRV('C101')],

  // ===== ヒョウガ村 =====
  ['van', '村長ヴァン', 'F100'],
  ['borg', '猟師ボルグ', 'F100'],
  ['yuki', '雪ん子ユキ', 'F100'],
  ['zack', '坑道の番人ザック', 'F100'],
  ['tsurara', '武器屋ツララ', 'F100', { role: 'weapon' }],
  ['mofu', '防具屋モフ', 'F100', { role: 'armor' }],
  ['danro', '薬屋ダンロ', 'F100', { role: 'potion', shop: 'shop.F100.potion' }],
  ['yukimi', '倉庫番ユキミ', 'F100', { role: 'storage' }],
  ['hyoga_taxi', 'そりの御者トナ', 'F100', TRV('C100', { fee: 2000, minLevel: 40 })],
  ['glen', '戦士の長老グレン', 'F117', { role: 'job' }],
  ['frost', '魔法使いの長老フロスト', 'F117', { role: 'job' }],
  ['heine', '弓使いの長老ハイネ', 'F117', { role: 'job' }],
  ['mist', '盗賊の長老ミスト', 'F117', { role: 'job' }],
  ['keel', '海賊の長老キール', 'F117', { role: 'job' }],
  ['glen_F107', '戦士の長老グレン', 'F107', { role: 'job' }],
  ['frost_F107', '魔法使いの長老フロスト', 'F107', { role: 'job' }],
  ['heine_F107', '弓使いの長老ハイネ', 'F107', { role: 'job' }],
  ['mist_F107', '盗賊の長老ミスト', 'F107', { role: 'job' }],
  ['keel_F107', '海賊の長老キール', 'F107', { role: 'job' }],
  ['dorga_F118', '戦士長ドルガ', 'F118', { role: 'job' }],
  ['orfe_F118', '大魔導師オルフェ', 'F118', { role: 'job' }],
  ['erna_F118', '弓の師範エルナ', 'F118', { role: 'job' }],
  ['yami_F118', '影の頭領ヤミ', 'F118', { role: 'job' }],
  ['rio_F118', 'キャプテン・リオ', 'F118', { role: 'job' }],

  // ===== ティンクル =====
  ['toy', '町長トイ', 'T100'],
  ['ruru', '人形師ルル', 'T100'],
  ['buro', '積み木職人ブロ', 'T100'],
  ['clock', '時計番のクロック婆', 'T100', { tier: 1 }],
  ['zenmai', '武器屋ゼンマイ', 'T100', { role: 'weapon' }],
  ['wata', '防具屋ワタ', 'T100', { role: 'armor' }],
  ['ame', '薬屋アメ', 'T100', { role: 'potion', shop: 'shop.T100.potion' }],
  ['hakobe', '倉庫番ハコベ', 'T100', { role: 'storage' }],
  ['kippu', 'ティンクルの駅員キップ', 'T101', TRV('C101', { fee: 1000, homeward: true })],
  ['gear', '受付ギア', 'T118'],
  ['paz', '受付パズ', 'T119'],

  // ===== マリナ =====
  ['ruri', '女王の侍女ルリ', 'M100', { tier: 1 }],
  ['awaji', '泡職人アワジ', 'M100'],
  ['shio', '料理人シオ', 'M100'],
  ['marin', '近衛兵マリン', 'M100', { tier: 1 }],
  ['sango', '武器屋サンゴ', 'M100', { role: 'weapon' }],
  ['kai_m', '防具屋カイガラ', 'M100', { role: 'armor' }],
  ['shizuku', '薬屋シズク', 'M100', { role: 'potion', shop: 'shop.M100.potion' }],
  ['tsubo', '倉庫番ツボ', 'M100', { role: 'storage' }],
  ['norma', '潜水船の船長ノーマ', 'M113', TRV('V100', { fee: 1500, homeward: true })],
  ['shell', '受付シェル', 'M114'],

  // ===== 古の神殿 =====
  ['alma', '神殿の巫女アルマ', 'P100'],
  ['inori', '薬屋イノリ', 'P100', { role: 'potion', shop: 'shop.P100.potion' }],
  ['ishi', '倉庫番イシ', 'P100', { role: 'storage' }],
  ['p_boat', '雲の船の船頭ミチ', 'P100', TRV('C101', { fee: 2000, homeward: true })],

  // ===== 竜の谷 =====
  ['haruka', '村長ハルカ', 'D100'],
  ['doran', '鍛冶屋ドラン', 'D100', { role: 'craft' }],
  ['uroko', '武器屋ウロコ', 'D100', { role: 'weapon' }],
  ['hone', '防具屋ホネ', 'D100', { role: 'armor' }],
  ['tsume', '薬屋ツメ', 'D100', { role: 'potion', shop: 'shop.D100.potion' }],
  ['su', '倉庫番ス', 'D100', { role: 'storage' }],
  ['hawk', '鳥使いホーク', 'D101', TRV('E100', { fee: 5000, minLevel: 150, requiresQuest: 'L-12' })],
  ['hane', '鳥の世話係ハネ', 'D101', TRV('C101', { fee: 3000, homeward: true })],
  ['vald', '竜の大老ヴァルド', 'D115', { role: 'job' }],
  ['nest', '受付ネスト', 'D116'],

  // ===== 焔の坑道 =====
  ['garon', '野営地の隊長ガロン', 'H100'],
  ['igni', '巨像の試練の番人イグニ', 'H100'],
  ['hinoko', '薬屋ヒノコ', 'H100', { role: 'potion', shop: 'shop.H100.potion' }],
  ['sumi', '倉庫番スミ', 'H100', { role: 'storage' }],

  // ===== 星の果て =====
  ['astra', '塔の主アストラ', 'E100'],
  ['hoshi', '薬屋ホシ', 'E100', { role: 'potion', shop: 'shop.E100.potion' }],
  ['kuzu', '倉庫番クズ', 'E100', { role: 'storage' }],

  // ===== クエストの追加（QUESTS.md 8 章）で足した人 =====
  ['sennin', '湯けむりの仙人', 'V619'],          // 谷の温泉の湯けむりの奥（隠しの依頼者。N-22〜N-24）
  ['memori', '冒険の記録係メモリ', 'V090'],      // 長い目標（敵の種類・町・クエストの数）とメダル（X 系）

  // ===== ジャンプの試練（world/jump.mjs の J001〜J005。町の案内人から入り、試練の下と上の案内人で町へ戻る） =====
  ['jq_mokuren', '木登り名人モクレン', 'V200', { role: 'jump', ...TRV('J001') }],
  ['jq_mokuren_J001', '木登り名人モクレン', 'J001', { x: 200, role: 'jump', ...TRV('V200', { homeward: true }) }],
  ['jq_mokuren_J001_top', '木登り名人モクレン', 'J001', { x: 960, top: true, role: 'jump', ...TRV('V200', { homeward: true }) }],
  ['jq_yotaka', '屋根番ヨタカ', 'V500', { role: 'jump', ...TRV('J002') }],
  ['jq_yotaka_J002', '屋根番ヨタカ', 'J002', { x: 200, role: 'jump', ...TRV('V500', { homeward: true }) }],
  ['jq_yotaka_J002_top', '屋根番ヨタカ', 'J002', { x: 960, top: true, role: 'jump', ...TRV('V500', { homeward: true }) }],
  ['jq_fuwari', '雲番フワリ', 'C100', { role: 'jump', ...TRV('J003') }],
  ['jq_fuwari_J003', '雲番フワリ', 'J003', { x: 200, role: 'jump', ...TRV('C100', { homeward: true }) }],
  ['jq_fuwari_J003_top', '雲番フワリ', 'J003', { x: 960, top: true, role: 'jump', ...TRV('C100', { homeward: true }) }],
  ['jq_gigi', 'ねじ巻きギギ', 'T100', { role: 'jump', ...TRV('J004') }],
  ['jq_gigi_J004', 'ねじ巻きギギ', 'J004', { x: 200, role: 'jump', ...TRV('T100', { homeward: true }) }],
  ['jq_gigi_J004_top', 'ねじ巻きギギ', 'J004', { x: 960, top: true, role: 'jump', ...TRV('T100', { homeward: true }) }],
  ['jq_garan', '骨守りガラン', 'D100', { role: 'jump', ...TRV('J005') }],
  ['jq_garan_J005', '骨守りガラン', 'J005', { x: 200, role: 'jump', ...TRV('D100', { homeward: true }) }],
  ['jq_garan_J005_top', '骨守りガラン', 'J005', { x: 960, top: true, role: 'jump', ...TRV('D100', { homeward: true }) }],
];

/** 「名前@マップ」→ ID（クエストの依頼者を直す）。マップに同じ名前がいなければ名前だけで探す。 */
export function npcIdOf(name, map) {
  const exact = NPCS.find((n) => n[1] === name && n[2] === map);
  if (exact) return exact[0];
  const any = NPCS.find((n) => n[1] === name);
  return any ? any[0] : null;
}
