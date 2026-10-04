// ミッションデータ — 「ルナ＆ジン、ヴァイス・ベイでのし上がる」
// objectives.type:
//   kill   : target=敵ID, count=撃破数
//   boss   : target=ボス敵ID, count=1
//   collect: target=アイテムID, count=所持数（報告時に消費）
//   reach  : target=マップID（そのマップに入る）, count=1
//   talk   : target=NPC ID（talkNpc イベント）, count=1
//   wanted : target=手配度★(1〜5) に到達, count=1
//   drive  : target='any'（車で走る）, count=距離m（10px=1m）
// 追加フィールド: category 'main'|'sub'|'daily', turnIn?: 報告先NPC（省略時 giver）, daily?: true（1日1回繰り返し）
// v2: 町にはモンスターが出ないため kill/collect の mapId はフィールドID（SPEC_V2）。
//     reward.exp は expToNext(reqLevel+2) × 係数（main 0.8 / sub 0.5 / daily 0.3）で自動算出（expFixed で固定可）。
import { expToNext } from './balance.js';
import { WORLD_MAP_IDS } from '../systems/travel.js';

// npcId → {name, mapId, role}（ワールド担当が maps.js の npcs に配置する）
export const MISSION_NPCS = {
  rico:        { name: 'リコ',          mapId: 'beach',    role: 'ビーチの情報屋。二人を街に引き込んだ張本人。' },
  sunny:       { name: 'サニー',        mapId: 'beach',    role: 'ライフガード兼ビーチ売店。サブ/デイリー。' },
  mama_rosa:   { name: 'ママ・ローザ',  mapId: 'downtown', role: 'ダウンタウンの食堂店主。ポーション屋。' },
  officer_kai: { name: 'カイ巡査',      mapId: 'downtown', role: '金で動く汚職警官。' },
  dj_pulse:    { name: 'DJパルス',      mapId: 'slums',    role: '港の倉庫で地下レイブを仕切るDJ。' },
  tank:        { name: 'タンク',        mapId: 'slums',    role: '港のメカニック。車の手配屋。' },
  old_boone:   { name: 'ブーンじいさん', mapId: 'swamp',   role: 'スワンプのワニ猟師。' },
  vivi:        { name: 'ヴィヴィ',      mapId: 'casino',   role: 'カジノ「ネオン・パレス」のディーラー。内通者。' },
  don_caiman:  { name: 'ドン・カイマン', mapId: 'casino',  role: '街を牛耳るカジノ王（黒幕）。ボス戦は tower_f3 の boss_don。' },
  nova:        { name: 'ノヴァ',        mapId: 'rooftop',  role: '天才ハッカー。最終決戦の案内役。' },
  // v2: ルミナ宇宙港
  dr_stella:   { name: 'ステラ博士',    mapId: 'spaceport', role: 'ルミナ宇宙港の主任研究者。謎の宇宙船を追っている。' },
  ace_jet:     { name: 'エース・ジェット', mapId: 'spaceport', role: '元テストパイロット。月面シミュ区画の管理人。' },
  // v3: 転職教官（転職ミッションの報告先。受注はプレイヤー頭上の吹き出しから）
  job_velvet:  { name: 'マダム・ヴェルヴェット', mapId: 'downtown', role: '[1次転職教官/ストリートスター] ダンススタジオ兼射撃場「ヴェルヴェット・ルーム」の女主人。', jobInstructor: true },
  job_bull:    { name: 'ブル・ガードナー', mapId: 'downtown', role: '[1次転職教官/ストリートブロウラー] 裏路地のボクシングジム兼ガレージの親父。', jobInstructor: true },
  job_lily:    { name: 'ゴースト・リリィ', mapId: 'slums', role: '[2次転職教官/ストリートスター] 港の倉庫に住む伝説のスナイパー兼レイブダンサー。', jobInstructor: true },
  job_croc:    { name: 'クロック・ジョー', mapId: 'swamp', role: '[2次転職教官/ストリートブロウラー] 沼の地下闘技場とエアボートレースの胴元。', jobInstructor: true },
  job_diamond: { name: 'クイーン・ダイヤ', mapId: 'casino', role: '[3次転職教官/ストリートスター] ネオン・パレスの看板スター。元・凄腕ガンマン。', jobInstructor: true },
  job_tiger:   { name: 'タイガー・ゴウ', mapId: 'casino', role: '[3次転職教官/ストリートブロウラー] カジノ街の用心棒頭にして元ストリートレース王者。', jobInstructor: true },
  job_celes:   { name: 'セレス', mapId: 'spaceport', role: '[4次転職教官/ストリートスター] 宇宙港のホログラム歌姫。正体は銀河の賞金稼ぎ。', jobInstructor: true },
  job_kaiser:  { name: 'カイザー・マグナ', mapId: 'spaceport', role: '[4次転職教官/ストリートブロウラー] 宇宙港の警備隊長。かつて「覇王」と呼ばれた男。', jobInstructor: true },
  job_zero:    { name: 'ゼロ', mapId: 'downtown', role: '[1次転職教官/ストリートハッカー] ネットカフェ兼ドローン工房「ゼロ・ポイント」の店長。', jobInstructor: true },
  job_byte:    { name: 'バイト', mapId: 'slums', role: '[2次転職教官/ストリートハッカー] 港の闇ジャンク屋。元・軍の電子戦技師。', jobInstructor: true },
  job_cipher:  { name: 'サイファー', mapId: 'rooftop', role: '[3次転職教官/ストリートハッカー] 摩天楼の屋上に潜む伝説のハッカー。ノヴァの師匠。', jobInstructor: true },
  job_quasar:  { name: 'クェーサー', mapId: 'spaceport', role: '[4次転職教官/ストリートハッカー] 宇宙港の量子コンピュータ。ホログラムの姿で話す。', jobInstructor: true },
};

// SPEC_V2 の全マップID（町7＋フィールド27）
export const MAP_IDS = [...WORLD_MAP_IDS];

const list = [
  // ======================= メインストーリー =======================
  {
    id: 'm01_welcome', name: '第1話 ヴァイス・ベイへようこそ', category: 'main', giver: 'rico', reqLevel: 1, prereq: [],
    desc: '一文無しでバスを降りた二人。情報屋リコが最初の「仕事」をくれた。',
    dialog: {
      offer: ['よう、新入り。ここはヴァイス・ベイ、夢と札束の街さ。', 'まずは腕試しだ。ビーチのスライムを片付けてくれ。'],
      done: ['悪くない動きだ。この街でやっていけそうだな。'],
    },
    objectives: [{ type: 'kill', target: 'slime_green', count: 8, mapId: 'beach_f1', text: 'サンセット海岸道でソーダスライムを倒す' }],
    reward: { exp: 40, money: 300, items: ['potion_red', 'potion_red', 'potion_red'] },
  },
  {
    id: 'm02_jelly', name: '第2話 ゼリーは金になる', category: 'main', giver: 'rico', reqLevel: 2, prereq: ['m01_welcome'],
    desc: 'スライムゼリーは裏通りのジューススタンドが高く買う…らしい。',
    dialog: {
      offer: ['ゼリーを集めてこい。ダウンタウンのジュース屋が欲しがってる。', '何に使うかって？ 聞かない方がいい。'],
      done: ['上出来だ。ほら、取り分だ。'],
    },
    objectives: [
      { type: 'collect', target: 'slime_jelly', count: 10, mapId: 'beach_f1', text: 'スライムゼリーを集める' },
      { type: 'kill', target: 'slime_pink', count: 6, mapId: 'beach_f1', text: 'ストロベリースライムを倒す' },
    ],
    reward: { exp: 90, money: 500, items: ['cap_street'] },
  },
  {
    id: 'm03_flamingo', name: '第3話 ピンクの暴走族', category: 'main', giver: 'rico', reqLevel: 5, prereq: ['m02_jelly'],
    desc: 'ビーチを荒らすヤンキーフラミンゴの群れ。リコの売店も被害に。',
    dialog: {
      offer: ['あのフラミンゴども、俺の店の看板を蹴り倒しやがった。', 'ガツンとやってくれ。'],
      done: ['スカッとしたぜ！ そろそろダウンタウンに顔を出す頃だな。'],
    },
    objectives: [
      { type: 'kill', target: 'mushroom_orange', count: 8, mapId: 'beach_f2', text: 'ヤシの並木道でビーチマッシュを倒す' },
      { type: 'kill', target: 'flamingo', count: 10, mapId: 'beach_f3', text: 'ピア桟橋でヤンキーフラミンゴを倒す' },
    ],
    reward: { exp: 220, money: 800, items: ['pistol_9mm', 'potion_blue', 'potion_blue'] },
  },
  {
    id: 'm04_rosa', name: '第4話 ママ・ローザの食堂', category: 'main', giver: 'rico', turnIn: 'mama_rosa', reqLevel: 9, prereq: ['m03_flamingo'],
    desc: 'リコの紹介でダウンタウンの顔役、ママ・ローザに会いに行く。',
    dialog: {
      offer: ['ダウンタウンのママ・ローザを訪ねな。あの人に気に入られりゃ街で生きていける。'],
      done: ['あんたたちがリコの言ってた二人組かい。いい目をしてるじゃないか。', 'ほら、まずはあたしのスープを飲みな。'],
    },
    objectives: [
      { type: 'reach', target: 'downtown', count: 1, text: 'ダウンタウンへ行く' },
      { type: 'talk', target: 'mama_rosa', count: 1, mapId: 'downtown', text: 'ママ・ローザと話す' },
    ],
    reward: { exp: 300, money: 600, items: ['potion_orange', 'potion_orange', 'potion_orange'] },
  },
  {
    id: 'm05_protection', name: '第5話 みかじめ料はお断り', category: 'main', giver: 'mama_rosa', reqLevel: 11, prereq: ['m04_rosa'],
    desc: '食堂にたかるチンピラたち。ママのために追い払え。',
    dialog: {
      offer: ['最近チンピラどもが「みかじめ料」をせびりに来るんだよ。', 'あんたたちで懲らしめておくれ。'],
      done: ['見直したよ！ これは昔、亭主が使ってた刀さ。持っていきな。'],
    },
    objectives: [
      { type: 'kill', target: 'thug_punk', count: 15, mapId: 'down_f1', text: 'ネオン裏通りでストリートチンピラを倒す' },
      { type: 'collect', target: 'street_tag', count: 8, mapId: 'down_f1', text: 'ギャングのワッペンを集める' },
    ],
    reward: { exp: 700, money: 1500, items: ['katana_steel'] },
  },
  {
    id: 'm06_dirty_badge', name: '第6話 汚れたバッジ', category: 'main', giver: 'officer_kai', reqLevel: 14, prereq: ['m05_protection'],
    desc: '汚職警官カイの依頼。署の目を引きつけ、その隙に証拠品を「処分」する。',
    dialog: {
      offer: ['お前らが噂の二人組か。俺はカイ。ちょっとした取引だ。', '街で派手に騒いで手配度★2まで上げろ。俺がその隙に動く。', 'ついでに巡回中の連中のバッジも頂いてこい。'],
      done: ['ハッ、いい陽動だった。これで俺たちは共犯だな。'],
    },
    objectives: [
      { type: 'wanted', target: 2, count: 1, text: '手配度★2に到達' },
      { type: 'collect', target: 'cop_badge', count: 3, text: '警官バッジを集める' },
    ],
    reward: { exp: 1100, money: 2500, items: ['sunglasses_aviator'] },
    // v3 ストーリー分岐（報告時に選ぶ。MissionManager.choose → turnIn で追加報酬・flag・称号）
    choicePrompt: 'カイが「証拠品」の入ったバッグを差し出した。…どうする？',
    choices: [
      { id: 'police', text: '証拠を署の正義派（覆面刑事）に渡す', flag: 'sidePolice', title: 'title_police_ally',
        reward: { money: 1000, items: ['drink_tough'] }, dialog: ['…お前、正気か？ ハッ、面白え。署にもまだマシな奴はいるさ。'] },
      { id: 'street', text: '証拠をストリートの情報屋に高値で売る', flag: 'sideStreet', title: 'title_street_face',
        reward: { money: 4000, items: ['chip_reroll'] }, dialog: ['ハハッ、そう来なくちゃな。俺たちは共犯だ、忘れるなよ。'] },
    ],
  },
  {
    id: 'm07_wheels', name: '第7話 ネオンの足', category: 'main', giver: 'officer_kai', turnIn: 'tank', reqLevel: 18, prereq: ['m06_dirty_badge'],
    desc: '港のメカニック、タンクが「足」を用意してくれるらしい。',
    dialog: {
      offer: ['港のタンクに会え。車がなきゃこの街じゃ半人前だ。'],
      done: ['こいつは俺のチューンしたスポーツカーさ。いい走りだったろ？', 'ジン、運転はお前担当だな。ルナは…ナビ席で踊るなよ。'],
    },
    dialogByFlag: {
      sidePolice: { offer: ['お前が渡した証拠のおかげで、署の空気が少し変わった。…礼は言わねえぞ。', '港のタンクに会え。車がなきゃこの街じゃ半人前だ。'] },
      sideStreet: { offer: ['証拠の売り上げで俺の借金はチャラだ。いい取引だったぜ、相棒。', '港のタンクに会え。裏ルートの車を用意してる。'] },
    },
    objectives: [
      { type: 'reach', target: 'slums', count: 1, text: '港（スラム）へ行く' },
      { type: 'talk', target: 'tank', count: 1, mapId: 'slums', text: 'タンクと話す' },
      { type: 'drive', target: 'any', count: 300, text: '車で走る（m）' },
    ],
    reward: { exp: 1500, money: 3000, items: ['boots_black', 'potion_orange', 'potion_orange'] },
  },
  {
    id: 'm08_rave', name: '第8話 地下レイブ・ナイト', category: 'main', giver: 'dj_pulse', reqLevel: 21, prereq: ['m07_wheels'],
    desc: 'DJパルスのレコードが港のゴロツキに盗まれた。今夜のレイブを救え。',
    dialog: {
      offer: ['ヘイ、そこのクールな二人！ 俺のレコードが盗まれたんだ！', 'ゴロツキどもから取り返してくれたら、ゲストリストに載せるぜ。'],
      done: ['最高だ！ 今夜のフロアは君たちのものさ。これ、俺の予備のヘッドホン。'],
    },
    objectives: [
      { type: 'kill', target: 'thug_dockhand', count: 15, mapId: 'slums_f1', text: '倉庫街で港のゴロツキを倒す' },
      { type: 'collect', target: 'stolen_vinyl', count: 6, mapId: 'slums_f1', text: '盗まれたレコードを取り返す' },
    ],
    reward: { exp: 2400, money: 4000, items: ['headphones_neon'], sp: 1 },
  },
  {
    id: 'm09_swamp', name: '第9話 沼地の密輸ルート', category: 'main', giver: 'dj_pulse', turnIn: 'old_boone', reqLevel: 24, prereq: ['m08_rave'],
    desc: 'ドン・カイマンの密輸船は沼地を通るらしい。ワニ猟師のブーンを訪ねる。',
    dialog: {
      offer: ['レイブの客から聞いた話だ。カジノ王の密輸船はスワンプを抜けるってな。', '沼のブーンじいさんなら抜け道を知ってるはずだ。'],
      done: ['ほう、わしの罠を荒らしたワニどもを片付けてくれたか。若いのにやるのう。'],
    },
    objectives: [
      { type: 'reach', target: 'swamp', count: 1, text: 'スワンプへ行く' },
      { type: 'kill', target: 'gator_swamp', count: 15, mapId: 'swamp_f1', text: '湿地の入口で沼ワニを倒す' },
      { type: 'collect', target: 'gator_tooth', count: 10, mapId: 'swamp_f1', text: 'ワニの牙を集める' },
    ],
    reward: { exp: 4500, money: 6000, items: ['cowboy_hat', 'potion_white', 'potion_white'] },
  },
  {
    id: 'm10_grandpa', name: '第10話 沼の主', category: 'main', giver: 'old_boone', reqLevel: 40, prereq: ['m09_swamp'],
    desc: '密輸船を守る巨大ワニ「グランパ・ゲイター」。こいつを倒せば道は開ける。',
    dialog: {
      offer: ['奥に「グランパ」がおる。ドンの連中が餌付けして番犬にしとるんじゃ。', 'あれを倒せる人間がいるとすれば、お前さんたちくらいじゃろう。'],
      done: ['信じられん…グランパを倒したのか！ 密輸船の積荷にカジノの名前があったぞ。'],
    },
    objectives: [{ type: 'boss', target: 'boss_gator', count: 1, mapId: 'swamp_f3', text: 'ワニの巣でグランパ・ゲイターを倒す' }],
    reward: { exp: 9000, money: 12000, items: ['katana_blood', 'elixir'], sp: 2 },
  },
  {
    id: 'm11_casino', name: '第11話 ハイローラー', category: 'main', giver: 'old_boone', turnIn: 'vivi', reqLevel: 42, prereq: ['m10_grandpa'],
    desc: 'カジノ「ネオン・パレス」に潜入。用心棒をかわし、内通者ヴィヴィと接触する。',
    dialog: {
      offer: ['ネオン・パレスに行け。ディーラーのヴィヴィはドンを憎んどる。'],
      done: ['あなたたちね、沼のグランパを倒したのは。', 'ドン・カイマンの金庫は最上階。でもまずは警備システムを潰さないと。'],
    },
    objectives: [
      { type: 'reach', target: 'casino', count: 1, text: 'カジノへ行く' },
      { type: 'kill', target: 'thug_bouncer', count: 20, mapId: 'casino_f2', text: '地下金庫でカジノの用心棒を倒す' },
      { type: 'collect', target: 'casino_chip', count: 15, mapId: 'casino_f2', text: 'カジノチップを集める' },
    ],
    reward: { exp: 15000, money: 20000, items: ['suit_black', 'idol_dress'] },
  },
  {
    id: 'm12_mecha', name: '第12話 セキュリティ・ブレイク', category: 'main', giver: 'vivi', reqLevel: 52, prereq: ['m11_casino'],
    desc: 'カジノを守る巨大警備ドローン「メカ・ハイローラー」を破壊せよ。',
    dialog: {
      offer: ['警備システムの中枢は「メカ・ハイローラー」。ドローンも全部それに繋がってる。', '壊せば最上階へのエレベーターが動くわ。'],
      done: ['やった！ システムダウン！ …でも、ドンは屋上へ逃げたみたい。'],
    },
    objectives: [
      { type: 'kill', target: 'drone_casino', count: 15, mapId: 'casino_f2', text: 'セキュリティドローンを倒す' },
      { type: 'boss', target: 'boss_mecha', count: 1, mapId: 'casino_f3', text: 'VIPフロアでメカ・ハイローラーを破壊する' },
    ],
    reward: { exp: 26000, money: 30000, items: ['guitar_thunder', 'sneakers_neon', 'elixir'], sp: 2 },
  },
  {
    id: 'm13_heat', name: '第13話 ヴァイス・ベイ大炎上', category: 'main', giver: 'officer_kai', reqLevel: 55, prereq: ['m12_mecha'],
    desc: 'ドンが警察を買収し、二人に全面手配が。カイと共に包囲網を突破しろ。',
    dialog: {
      offer: ['まずいことになった。ドンが署長を買収しやがった。お前らは今や街の最重要指名手配犯だ。', 'どうせなら派手にいけ。★4の包囲網をぶち破れ！'],
      done: ['ははっ、SWATまで蹴散らすとはな。俺もとうとう腹を括ったぜ。', 'ドンは摩天楼の屋上だ。ノヴァって奴が道を開けてくれる。'],
    },
    objectives: [
      { type: 'wanted', target: 4, count: 1, text: '手配度★4に到達' },
      { type: 'kill', target: 'swat_trooper', count: 6, text: '町でSWAT隊員を倒す' },
    ],
    reward: { exp: 34000, money: 40000, items: ['armor_vest', 'armor_pants'] },
    dialogByFlag: {
      sidePolice: { offer: ['ドンが署長を買収した。…だが、お前が前に証拠を渡した刑事たちが動いてくれてる。', '★4の包囲網をぶち破れ！ 正義派が裏で道を開ける。'] },
      sideStreet: { offer: ['ドンが署長を買収しやがった。街のギャングどもも黙っちゃいねえ。', '★4の包囲網をぶち破れ！ ストリートの連中が陽動してくれる。'] },
    },
    choicePrompt: '包囲網を抜けた先で、カイが問う。「最後の決戦、誰と組む？」',
    choices: [
      { id: 'police', text: 'カイと署の正義派に付く', flag: 'sidePolice2',
        reward: { money: 10000, items: ['drink_tough', 'drink_tough'] }, dialog: ['いいだろう。バッジの誇りってやつを、最後に一度だけ信じてみるか。'] },
      { id: 'street', text: 'ストリートのギャングと共闘する', flag: 'sideStreet2',
        reward: { money: 20000, items: ['chip_reroll', 'chip_reroll'] }, dialog: ['裏通りの連中が全員お前の味方だ。…俺も、な。'] },
    ],
  },
  {
    id: 'm14_rooftop', name: '第14話 摩天楼の頂へ', category: 'main', giver: 'officer_kai', turnIn: 'nova', reqLevel: 58, prereq: ['m13_heat'],
    desc: '屋上へ続く道にはドンの殺し屋とアサルトドローン。ハッカーのノヴァと合流せよ。',
    dialog: {
      offer: ['屋上へ行け。ノヴァが待ってる。'],
      done: ['お待たせ、ヒーローさんたち。ドンのドローン網は私がハックしておいたわ。', 'あとは…あなたたちの拳と弾丸次第ね。'],
    },
    dialogByFlag: {
      sidePolice2: { done: ['お待たせ。警察無線は全部こっちで拾ってる。正義派のSWATが下の階を押さえてくれるわ。', 'あとは…あなたたちの拳と弾丸次第ね。'] },
      sideStreet2: { done: ['お待たせ。ギャングたちが表で暴れてくれてるおかげで、警備はガラ空きよ。', 'あとは…あなたたちの拳と弾丸次第ね。'] },
    },
    objectives: [
      { type: 'reach', target: 'rooftop', count: 1, text: '摩天楼の屋上へ行く' },
      { type: 'kill', target: 'thug_hitman', count: 15, mapId: 'tower_f1', text: '工事現場の足場でドンの殺し屋を倒す' },
      { type: 'kill', target: 'drone_attack', count: 10, mapId: 'tower_f1', text: 'アサルトドローンを倒す' },
    ],
    reward: { exp: 50000, money: 50000, items: ['wings_angel', 'elixir', 'elixir'], sp: 2 },
  },
  {
    id: 'm15_don', name: '最終話 ネオン・ヴァイス', category: 'main', giver: 'nova', reqLevel: 70, prereq: ['m14_rooftop'],
    desc: 'ヴァイス・ベイの支配者ドン・カイマンとの最終決戦。',
    dialog: {
      offer: ['ドン・カイマンはヘリポートにいる。逃げられる前に決着を。', 'この街の夜明けを、あなたたちの手で。'],
      done: ['…やったのね。ドンの時代は終わった。', '今日からこの街の夜は、あなたたち二人のもの。ようこそ、新しいボスさん。'],
    },
    objectives: [{ type: 'boss', target: 'boss_don', count: 1, mapId: 'tower_f3', text: '最上階ペントハウスでドン・カイマンを倒す' }],
    reward: { exp: 120000, money: 200000, items: ['crown_neon', 'neon_sword'], sp: 3, flag: 'storyClear' },
    choicePrompt: '膝をついたドン・カイマンが笑う。「この街の光は全部、俺が灯した。…お前が継ぐか？」',
    choices: [
      { id: 'police', text: 'ドンを警察に引き渡す（街に光を返す）', flag: 'endingHero', title: 'title_bay_hero',
        reward: { money: 50000, items: ['elixir', 'elixir', 'elixir'] },
        dialog: ['…やったのね。ドンは正式に逮捕された。明日の新聞の一面はあなたたちよ。', 'この街の夜は、もう誰のものでもない。みんなのものになった。'] },
      { id: 'street', text: 'ドンの座を奪う（新しいボスになる）', flag: 'endingDon', title: 'title_new_don',
        reward: { money: 300000, items: ['gold_bar', 'gold_bar', 'chip_lock'] },
        dialog: ['…ドンの時代は終わった。そして、あなたたちの時代が始まる。', 'ようこそ、新しいボスさん。この街の夜は、あなたたち二人のもの。'] },
    ],
  },

  // ======================= サブ =======================
  {
    id: 's01_feathers', name: 'サニーのピンク羽', category: 'sub', giver: 'sunny', reqLevel: 6, prereq: [],
    desc: 'ビーチ売店の新作お土産に、フラミンゴの羽が必要。',
    dialog: { offer: ['新作のドリームキャッチャーを作りたいの！ フラミンゴの羽を集めてくれない？'], done: ['わぁ、きれい！ お礼にこのサンダルどうぞ！'] },
    objectives: [{ type: 'collect', target: 'flamingo_feather', count: 8, mapId: 'beach_f3', text: 'フラミンゴの羽を集める' }],
    reward: { exp: 200, money: 600, items: ['sandals_beach', 'potion_red', 'potion_red'] },
  },
  {
    id: 's02_king_slime', name: 'ビーチの王様', category: 'sub', giver: 'sunny', reqLevel: 8, prereq: ['s01_feathers'],
    desc: '夕暮れのビーチに巨大なスライム「キングゼリー」が現れるらしい。',
    dialog: { offer: ['夕方になるとね、すっごく大きいスライムが出るの…海水浴客が怖がってるわ。'], done: ['本当に倒しちゃったの！？ あなたたち、ビーチのヒーローね！'] },
    objectives: [{ type: 'boss', target: 'boss_king_slime', count: 1, mapId: 'beach_f3', text: 'ピア桟橋でキングゼリーを倒す' }],
    reward: { exp: 900, money: 2000, items: ['gold_chain'], sp: 1 },
  },
  {
    id: 's03_mushroom_soup', name: 'ママの秘伝スープ', category: 'sub', giver: 'mama_rosa', reqLevel: 11, prereq: ['m04_rosa'],
    desc: 'ママ・ローザの名物スープにはネオンキノコが欠かせない。',
    dialog: { offer: ['スープの材料が切れちまってね。キノコのかさを集めておくれ。'], done: ['これでまた店を開けられるよ。ほら、まかないのドリンクだ。'] },
    objectives: [
      { type: 'kill', target: 'mushroom_neon', count: 12, mapId: 'down_f1', text: 'ネオンキノコを倒す' },
      { type: 'collect', target: 'mushroom_cap', count: 15, text: 'キノコのかさを集める' },
    ],
    reward: { exp: 800, money: 1800, items: ['drink_energy', 'drink_energy', 'potion_orange', 'potion_orange'] },
  },
  {
    id: 's04_toxic', name: '港の大掃除', category: 'sub', giver: 'tank', reqLevel: 21, prereq: ['m07_wheels'],
    desc: 'ガレージの排水口がヘドロスライムで詰まった。',
    dialog: { offer: ['排水口からヘドロスライムが湧いてきやがる。エンジンが錆びちまうぜ。'], done: ['助かった！ こいつは客の忘れ物だ、使ってくれ。'] },
    objectives: [{ type: 'kill', target: 'slime_toxic', count: 20, mapId: 'slums_f1', text: '倉庫街でヘドロスライムを倒す' }],
    reward: { exp: 2200, money: 3500, items: ['track_pants'] },
  },
  {
    id: 's05_albino', name: '白い悪魔', category: 'sub', giver: 'old_boone', reqLevel: 36, prereq: ['m09_swamp'],
    desc: '幻のアルビノゲイター。その鱗は高値で売れる。',
    dialog: { offer: ['白いワニを見たことがあるか？ あれの鱗は金より価値がある。'], done: ['見事じゃ。わしの若い頃の帽子をやろう。'] },
    objectives: [
      { type: 'kill', target: 'gator_albino', count: 10, mapId: 'swamp_f3', text: 'ワニの巣でアルビノゲイターを倒す' },
      { type: 'collect', target: 'gator_scale', count: 3, mapId: 'swamp_f3', text: 'アルビノの鱗を集める' },
    ],
    reward: { exp: 6000, money: 8000, items: ['helmet_moto'] },
  },
  {
    id: 's06_gold_rush', name: 'ゴールドラッシュ', category: 'sub', giver: 'vivi', reqLevel: 48, prereq: ['m11_casino'],
    desc: 'カジノの金庫からゴールドスライムが逃げ出した！',
    dialog: { offer: ['内緒よ？ 金庫の中でゴールドスライムを飼ってたの。逃げちゃったけど。'], done: ['ふふ、お礼はたっぷり弾むわ。'] },
    objectives: [
      { type: 'kill', target: 'slime_gold', count: 15, mapId: 'casino_f2', text: '地下金庫でゴールドスライムを倒す' },
      { type: 'collect', target: 'gold_bar', count: 2, text: '金の延べ棒を集める' },
    ],
    reward: { exp: 18000, money: 30000, items: ['drink_lucky', 'gold_chain_heavy'] },
  },
  {
    id: 's07_rave_drive', name: 'ミッドナイト・ドライブ', category: 'sub', giver: 'dj_pulse', reqLevel: 22, prereq: ['m08_rave'],
    desc: 'レイブの宣伝のため、ネオン街を車で流してほしい。',
    dialog: { offer: ['俺の新曲を爆音で流しながら街を走ってくれ！ 最高の宣伝になる！'], done: ['街中で噂になってるぜ！ サンキュー！'] },
    objectives: [{ type: 'drive', target: 'any', count: 800, text: '車で走る（m）' }],
    reward: { exp: 2600, money: 5000, items: ['sunglasses_neon'] },
  },

  {
    id: 's08_rat_king', name: '地下鉄の王', category: 'sub', giver: 'officer_kai', reqLevel: 16, prereq: ['m05_protection'],
    desc: '地下鉄トンネルの奥に、巨大なネズミの「王」がいるという通報が相次いでいる。',
    dialog: { offer: ['地下鉄トンネルからの通報が止まらねえ。でかいネズミが王冠かぶってるんだと。', '署は動かねえ。…お前らが片付けてくれりゃ、借りにしといてやる。'], done: ['マジでいたのかよ…。その王冠、記念に取っとけ。'] },
    objectives: [
      { type: 'kill', target: 'rat_subway', count: 12, mapId: 'down_f2', text: '地下鉄トンネルでメトロラットを倒す' },
      { type: 'boss', target: 'boss_rat_king', count: 1, mapId: 'down_f2', text: 'ラットキングを倒す' },
    ],
    reward: { money: 3000, items: ['sunglasses_neon', 'potion_orange', 'potion_orange'], sp: 1 },
  },
  {
    id: 's09_smuggler', name: '密輸船を叩け', category: 'sub', giver: 'dj_pulse', reqLevel: 31, prereq: ['m08_rave'],
    desc: 'ドンの密輸船が造船所の先に停泊している。船長ハーケンから海図を奪え。',
    dialog: { offer: ['レイブの機材を運んでた船、実はドンの密輸船だったんだ。', '船長のハーケンが持ってる海図があれば、ドンの尻尾を掴める！'], done: ['これがドンの密輸ルート…！ 最高のネタだぜ。'] },
    objectives: [
      { type: 'reach', target: 'slums_f3', count: 1, text: '密輸船に乗り込む' },
      { type: 'boss', target: 'boss_captain', count: 1, mapId: 'slums_f3', text: 'キャプテン・ハーケンを倒す' },
      { type: 'collect', target: 'pirate_map', count: 1, mapId: 'slums_f3', text: '密輸船の海図を手に入れる' },
    ],
    reward: { money: 9000, items: ['gold_chain_heavy', 'potion_white', 'potion_white'], sp: 1 },
  },

  // ======================= v2: ルミナ宇宙港 =======================
  {
    id: 'sp01_spaceport', name: '星を目指す街', category: 'sub', giver: 'tank', turnIn: 'dr_stella', reqLevel: 36, prereq: ['m08_rave'],
    desc: '廃線路の先にある「ルミナ宇宙港」。タンクの古い友人、ステラ博士を訪ねる。',
    dialog: {
      offer: ['廃線路をずっと行くと海沿いにロケットが見えてくる。ルミナ宇宙港だ。', '昔の仲間のステラ博士が困ってるらしい。顔を出してやってくれ。'],
      done: ['タンクの紹介ね。ちょうど腕の立つ人を探してたの。', '沿岸のパトロールボットが暴走してて、搬入が止まってるのよ。'],
    },
    objectives: [
      { type: 'kill', target: 'robot_patrol', count: 15, mapId: 'space_f1', text: '沿岸ロケット道でパトロールボットを止める' },
      { type: 'reach', target: 'spaceport', count: 1, text: 'ルミナ宇宙港へ行く' },
      { type: 'talk', target: 'dr_stella', count: 1, mapId: 'spaceport', text: 'ステラ博士と話す' },
    ],
    reward: { money: 8000, items: ['potion_white', 'potion_white', 'potion_mana'] },
  },
  {
    id: 'sp02_launchpad', name: '発射台の暴走', category: 'sub', giver: 'dr_stella', reqLevel: 42, prereq: ['sp01_spaceport'],
    desc: '発射台エリアの搬入ロボが言うことを聞かない。部品を回収して制御を取り戻す。',
    dialog: { offer: ['搬入ロボの制御チップが誰かに書き換えられてる。', '壊して歯車を回収してきて。解析すれば犯人がわかるはず。'], done: ['この歯車…地球の規格じゃない。まさか、本当に…？'] },
    objectives: [
      { type: 'kill', target: 'robot_loader', count: 15, mapId: 'space_f2', text: '発射台エリアで搬入ロボを倒す' },
      { type: 'collect', target: 'robot_gear', count: 10, mapId: 'space_f2', text: 'ロボの歯車を集める' },
    ],
    reward: { money: 14000, items: ['helmet_astro'] },
  },
  {
    id: 'sp03_grey', name: 'エイリアンの痕跡', category: 'sub', giver: 'dr_stella', reqLevel: 46, prereq: ['sp02_launchpad'],
    desc: '発射台に現れた灰色の人影。博士は「グレイ」と呼んでいる。',
    dialog: { offer: ['監視カメラに映ってたの。灰色の、大きな目の…。', '彼らが持ってるクリスタルを調べたいわ。'], done: ['このクリスタル、脈打ってる…生きてるみたい。', '発信源は海の向こう…月面シミュ区画の先よ。'] },
    objectives: [
      { type: 'kill', target: 'alien_grey', count: 12, mapId: 'space_f2', text: 'グレイを倒す' },
      { type: 'collect', target: 'alien_crystal', count: 3, mapId: 'space_f2', text: 'エイリアン・クリスタルを集める' },
    ],
    reward: { money: 20000, items: ['pistol_ray', 'elixir'], sp: 1 },
  },
  {
    id: 'sp04_moon', name: '月面シミュレーション', category: 'sub', giver: 'ace_jet', reqLevel: 76, prereq: ['sp03_grey'],
    desc: '月面シミュ区画が何者かに乗っ取られた。管理人ジェットと区画を取り戻す。',
    dialog: { offer: ['俺の区画がめちゃくちゃだ。ゴーレムまで湧いてやがる。', '区画を掃除して月の石を集めてくれ。…模造品のはずなんだがな。'], done: ['この石、本物の月の石だ…。誰が運び込んだ？', '博士が呼んでる。いよいよ「船」に乗り込むらしいぜ。'] },
    objectives: [
      { type: 'reach', target: 'space_f3', count: 1, text: '月面シミュ区画へ行く' },
      { type: 'kill', target: 'golem_moon', count: 10, mapId: 'space_f3', text: 'ムーンゴーレムを倒す' },
      { type: 'collect', target: 'moon_rock', count: 5, mapId: 'space_f3', text: '月の石を集める' },
    ],
    reward: { money: 60000, items: ['armor_astro', 'pants_astro', 'elixir'], sp: 2 },
  },
  {
    id: 'sp05_overlord', name: '未知との遭遇', category: 'sub', giver: 'dr_stella', reqLevel: 90, prereq: ['sp04_moon'],
    desc: '海上に浮かぶ謎の宇宙船。その主「オーバーロード・ゾグ」がヴァイス・ベイを狙っている。',
    dialog: { offer: ['宇宙船の主は、この街のネオンをエネルギーにするつもりよ。', 'ドンを倒したあなたたちなら…お願い、街を守って。'], done: ['信じられない…あなたたち、宇宙人まで倒しちゃった。', 'この子、船の中にいたの。あなたたちに懐いてるみたい。連れていってあげて。'] },
    objectives: [{ type: 'boss', target: 'boss_alien', count: 1, mapId: 'space_f4', text: '謎の宇宙船でオーバーロード・ゾグを倒す' }],
    reward: { money: 300000, items: ['pet_alien', 'halo_cosmic'], sp: 3, flag: 'alienClear' },
  },

  // ======================= デイリー（1日1回） =======================
  {
    id: 'd01_beach_patrol', name: '[デイリー] ビーチパトロール', category: 'daily', daily: true, giver: 'sunny', reqLevel: 3, prereq: [],
    desc: '毎日のビーチ清掃。', dialog: { offer: ['今日もスライムが大発生！ 手伝って！'], done: ['ありがと！ また明日もよろしくね！'] },
    objectives: [{ type: 'kill', target: 'slime_pink', count: 20, mapId: 'beach_f2', text: 'ストロベリースライムを倒す' }],
    reward: { exp: 150, money: 800, items: ['potion_red', 'potion_red', 'potion_red', 'potion_red', 'potion_red'] },
  },
  {
    id: 'd02_street_sweep', name: '[デイリー] ストリート・スウィープ', category: 'daily', daily: true, giver: 'mama_rosa', reqLevel: 12, prereq: ['m05_protection'],
    desc: '懲りないチンピラを毎日お掃除。', dialog: { offer: ['またあの連中が来てるよ。頼んだよ！'], done: ['助かるねぇ。今日のまかないだよ。'] },
    objectives: [{ type: 'kill', target: 'thug_punk', count: 25, mapId: 'down_f1', text: 'ストリートチンピラを倒す' }],
    reward: { exp: 1200, money: 2500, items: ['potion_orange', 'potion_orange', 'potion_orange', 'potion_blue', 'potion_blue'] },
  },
  {
    id: 'd03_heat_check', name: '[デイリー] ヒート・チェック', category: 'daily', daily: true, giver: 'officer_kai', reqLevel: 15, prereq: ['m06_dirty_badge'],
    desc: '署の目をそらすための陽動。', dialog: { offer: ['今日も騒いでくれ。★3だ。'], done: ['いい仕事だ。いつもの封筒だ。'] },
    objectives: [{ type: 'wanted', target: 3, count: 1, text: '手配度★3に到達' }],
    reward: { exp: 2000, money: 6000, items: [] },
  },
  {
    id: 'd04_delivery', name: '[デイリー] デリバリー・ラン', category: 'daily', daily: true, giver: 'tank', reqLevel: 18, prereq: ['m07_wheels'],
    desc: 'パーツの配達。とにかく走れ。', dialog: { offer: ['今日の配達だ。ぶっ飛ばしてこい！'], done: ['タイム更新だな！'] },
    objectives: [{ type: 'drive', target: 'any', count: 500, text: '車で走る（m）' }],
    reward: { exp: 1800, money: 4000, items: ['drink_energy'] },
  },
  {
    id: 'd05_swamp_hunt', name: '[デイリー] ワニ狩り', category: 'daily', daily: true, giver: 'old_boone', reqLevel: 24, prereq: ['m09_swamp'],
    desc: 'ワニの牙は毎日需要がある。', dialog: { offer: ['今日も牙を頼むぞ。'], done: ['ほい、今日の稼ぎじゃ。'] },
    objectives: [{ type: 'collect', target: 'gator_tooth', count: 15, mapId: 'swamp_f1', text: 'ワニの牙を集める' }],
    reward: { exp: 5000, money: 9000, items: ['potion_white', 'potion_white', 'potion_mana'] },
  },
  {
    id: 'd06_high_stakes', name: '[デイリー] ハイステークス', category: 'daily', daily: true, giver: 'vivi', reqLevel: 48, prereq: ['m11_casino'],
    desc: 'カジノチップを両替して一儲け。', dialog: { offer: ['チップを集めてきて。いいレートで換金してあげる。'], done: ['今日もあなたの勝ちね。'] },
    objectives: [{ type: 'collect', target: 'casino_chip', count: 20, mapId: 'casino_f2', text: 'カジノチップを集める' }],
    reward: { exp: 12000, money: 25000, items: ['power_elixir'] },
  },
  {
    id: 'd07_rooftop_contract', name: '[デイリー] 屋上の掃除屋', category: 'daily', daily: true, giver: 'nova', reqLevel: 62, prereq: ['m14_rooftop'],
    desc: 'ドンの残党狩り。', dialog: { offer: ['残党がまだ屋上にいるわ。片付けて。'], done: ['ナイス。報酬は振り込んでおいたわ。'] },
    objectives: [
      { type: 'kill', target: 'thug_hitman', count: 20, mapId: 'tower_f1', text: 'ドンの殺し屋を倒す' },
      { type: 'kill', target: 'thug_merc', count: 10, mapId: 'tower_f2', text: '空中庭園で傭兵スナイパーを倒す' },
    ],
    reward: { exp: 40000, money: 60000, items: ['elixir', 'drink_lucky'] },
  },
  {
    id: 'd08_space_jelly', name: '[デイリー] クラゲ注意報', category: 'daily', daily: true, giver: 'ace_jet', reqLevel: 38, prereq: ['sp01_spaceport'],
    desc: '沿岸ロケット道にクラゲが打ち上がって発射に支障が出る。', dialog: { offer: ['今日もクラゲだらけだ。ロケットが飛べねえ！'], done: ['助かった、今日も定刻発射だ！'] },
    objectives: [{ type: 'kill', target: 'jelly_coast', count: 20, mapId: 'space_f1', text: 'コーストクラゲを倒す' }],
    reward: { money: 12000, items: ['potion_white', 'potion_white', 'potion_mana'] },
  },
];


// ======================= v3: 転職ミッション（type:'job'） =======================
// 受注はプレイヤー頭上の吹き出し → systems/jobs.js acceptJobMission のみ（NPC の available() には出さない）。
// 報告は教官 NPC（giver = turnIn = 教官）。報告時に MissionManager.turnIn が advanceJob を呼ぶ。
// 目的: ①教官に会う（talk。報告と同時に満たされる）②試練（その段階の適正Lvフィールドの敵 or ミニボス / ドライブ）
const T = (target, text, extra = {}) => ({ type: 'talk', target, count: 1, text, ...extra });
const K = (target, count, mapId, text) => ({ type: 'kill', target, count, mapId, text });
const B = (target, mapId, text) => ({ type: 'boss', target, count: 1, mapId, text });
const D = (count, text) => ({ type: 'drive', target: 'any', count, text });
const JOB_TIER_LEVEL = [0, 10, 30, 60, 100];
const JOB_TOWN = Object.fromEntries(Object.entries(MISSION_NPCS).filter(([, n]) => n.jobInstructor).map(([id, n]) => [id, n.mapId]));
function jobMission(jobId, tier, instructor, name, desc, offer, done, trials, reward = {}) {
  const npc = MISSION_NPCS[instructor];
  return {
    id: 'job_' + jobId, type: 'job', jobId, tier, name: `[転職] ${name}`, category: 'job', giver: instructor, turnIn: instructor,
    reqLevel: JOB_TIER_LEVEL[tier], prereq: [], desc, dialog: { offer, done },
    objectives: [T(instructor, `${npc.name}（${JOB_TOWN[instructor]}）に会う`, { mapId: JOB_TOWN[instructor] }), ...trials],
    reward: { money: [0, 3000, 20000, 120000, 500000][tier], items: [], ...reward },
  };
}
const jobMissions = [
  // ---- ルナ 1次（ダウンタウン / マダム・ヴェルヴェット） ----
  jobMission('luna_gunner', 1, 'job_velvet', 'ネオン・ガンナーへの道',
    'ヴェルヴェット・ルームの射撃場で、銃の才能を試される。',
    ['あら、いい目をしてるじゃない。撃つ側の目よ。', 'ハイウェイ入口のカモメを撃ち落として、ピア桟橋のキングスライムを仕留めてきなさい。'],
    ['ふふ、合格よ。今日からあなたは「ネオン・ガンナー」。', 'その銃、もうあなたの体の一部ね。'],
    [K('seagull_highway', 12, 'beach_f4', 'ハイウェイ入口でハイウェイカモメを撃ち落とす'), B('boss_king_slime', 'beach_f3', 'ピア桟橋でキングゼリーを倒す')]),
  jobMission('luna_dancer', 1, 'job_velvet', 'ネオン・ダンサーへの道',
    'ヴェルヴェット・ルームのダンスフロアで、リズムと速さを試される。',
    ['踊れる子は戦える。それがこの街のルールよ。', 'ハイウェイのコーンマッシュと裏通りのドブネズミ、ステップを踏みながら片付けて。'],
    ['ブラボー！ 今日からあなたは「ネオン・ダンサー」。', '街全部があなたのステージよ。'],
    [K('mushroom_cone', 12, 'beach_f4', 'ハイウェイ入口でコーンマッシュを倒す'), K('rat_alley', 10, 'down_f1', 'ネオン裏通りでドブネズミを倒す')]),
  // ---- ジン 1次（ダウンタウン / ブル・ガードナー） ----
  jobMission('jin_brawler', 1, 'job_bull', 'ネオン・ブロウラーへの道',
    'ブルのジムで、拳ひとつの覚悟を試される。',
    ['ほう、いい拳だ。だが本物かどうかは殴り合いで決まる。', 'ハイウェイのアイアンクラブの甲羅を割って、キングゼリーをぶっ飛ばしてこい。'],
    ['ガハハ！ 合格だ。今日からお前は「ネオン・ブロウラー」！', 'グローブは要らねえ。その拳が名刺だ。'],
    [K('crab_iron', 12, 'beach_f4', 'ハイウェイ入口でアイアンクラブを倒す'), B('boss_king_slime', 'beach_f3', 'ピア桟橋でキングゼリーを倒す')]),
  jobMission('jin_racer', 1, 'job_bull', 'ナイト・レーサーへの道',
    'ブルのガレージで、走り屋の素質を試される。',
    ['お前、ハンドル握ると目つきが変わるな。', '車で街を走り込んで、裏通りのチンピラどもを蹴散らしてこい。'],
    ['いい走りだった。今日からお前は「ナイト・レーサー」だ。', '夜の道路は全部お前のサーキットだぜ。'],
    [D(300, '車で走る（m）'), K('thug_punk', 12, 'down_f1', 'ネオン裏通りでストリートチンピラを倒す')]),
  // ---- ルナ 2次（スラム / ゴースト・リリィ） ----
  jobMission('luna_sharpshooter', 2, 'job_lily', 'ピンク・シャープシューターへの道',
    '港の霧の中、伝説の狙撃手リリィが試練を課す。',
    ['…一発で決めな。二発目を撃つやつは三発目で死ぬ。', '造船所の鉄砲玉を黙らせて、密輸船のキャプテン・ハーケンの帽子を撃ち抜いてきて。'],
    ['…いい腕。今日からあなたは「ピンク・シャープシューター」。', '霧の向こうでも、もう外さない。'],
    [K('thug_gunner', 20, 'slums_f2', '造船所でギャングの鉄砲玉を倒す'), B('boss_captain', 'slums_f3', '密輸船でキャプテン・ハーケンを倒す')]),
  jobMission('luna_rave_star', 2, 'job_lily', 'レイヴ・スターへの道',
    '倉庫の地下レイブ。フロアの主リリィが、本物のスターかを見極める。',
    ['フロアを沸かせられないダンサーは、ここじゃ置き物よ。', '密輸船の船員とふなネズミ、まとめて踊らせてきて。'],
    ['最高のショーだった！ 今日からあなたは「レイヴ・スター」。', '低音が鳴る場所なら、どこでもあなたが主役よ。'],
    [K('thug_smuggler', 20, 'slums_f3', '密輸船で密輸船の船員を倒す'), K('rat_ship', 15, 'slums_f3', '密輸船でふなネズミを倒す')]),
  // ---- ジン 2次（スワンプ / クロック・ジョー） ----
  jobMission('jin_knuckle_champ', 2, 'job_croc', 'ナックル・チャンプへの道',
    '沼の地下闘技場。胴元クロック・ジョーが新たな王者候補を値踏みする。',
    ['ヘッヘ、闘技場の王座が空いてるんだ。座りてえか？', 'マングローブのボアを絞め返して、密輸船のキャプテン・ハーケンをリングに沈めてきな。'],
    ['新チャンピオンの誕生だ！ 今日からお前は「ナックル・チャンプ」！', '沼じゅうの賭け札がお前に乗ってるぜ。'],
    [K('snake_mangrove', 20, 'swamp_f2', 'マングローブ迷路でマングローブ・ボアを倒す'), B('boss_captain', 'slums_f3', '密輸船でキャプテン・ハーケンを倒す')]),
  jobMission('jin_drifter', 2, 'job_croc', 'ストリート・ドリフターへの道',
    'エアボートレースの胴元が、泥道でも滑れる走り屋を探している。',
    ['泥の上でドリフトできりゃ、どこでも走れる。', 'たっぷり走り込んで、廃線路のスクラップ屋どもを跳ね飛ばしてこい。'],
    ['見事なドリフトだ！ 今日からお前は「ストリート・ドリフター」。', 'マフラーの炎、俺にも分けてほしいくらいだぜ。'],
    [D(600, '車で走る（m）'), K('thug_scrapper', 20, 'slums_f4', '廃線路でスクラップ屋を倒す')]),
  // ---- ルナ 3次（カジノ / クイーン・ダイヤ） ----
  jobMission('luna_trigger_maestro', 3, 'job_diamond', 'トリガー・マエストロへの道',
    'ネオン・パレスの看板スター、ダイヤが頂点の座を賭けた勝負を挑む。',
    ['頂点の座が欲しい？ いいわ、チップは命よ。', 'VIPフロアのディーラーロボを撃ち抜いて、メカ・ハイローラーを止めてきなさい。'],
    ['ブラボー。今日からあなたが「トリガー・マエストロ」。', 'この街の引き金は、全部あなたのものよ。'],
    [K('robot_dealer', 25, 'casino_f3', 'VIPフロアでディーラーロボを倒す'), B('boss_mecha', 'casino_f3', 'VIPフロアでメカ・ハイローラーを倒す')]),
  jobMission('luna_prism_idol', 3, 'job_diamond', 'プリズム・アイドルへの道',
    'カジノの大舞台に立つための最終オーディション。',
    ['大舞台に立つ子は、どんな客も魅了しなきゃ。幽霊でも、殺し屋でもね。', 'VIPフロアのジャックポット・ゴーストと、工事現場の殺し屋を虜にしてきて。'],
    ['満員御礼！ 今日からあなたは「プリズム・アイドル」。', '七色のスポットライトはあなただけのものよ。'],
    [K('ghost_jackpot', 25, 'casino_f3', 'VIPフロアでジャックポット・ゴーストを倒す'), K('thug_hitman', 20, 'tower_f1', '工事現場の足場でドンの殺し屋を倒す')]),
  // ---- ジン 3次（カジノ / タイガー・ゴウ） ----
  jobMission('jin_dragon_fist', 3, 'job_tiger', 'ドラゴンフィストへの道',
    '用心棒頭タイガー・ゴウが、龍を宿す拳かを見定める。',
    ['拳に龍を宿すには、鋼を砕く覚悟がいる。', '工事現場のスチールゴーレムを砕いて、メカ・ハイローラーをスクラップにしてこい。'],
    ['…見えたぞ、お前の拳の龍が。今日からお前は「ネオン・ドラゴンフィスト」。', '摩天楼が震えてやがる。'],
    [K('golem_steel', 25, 'tower_f1', '工事現場の足場でスチールゴーレムを倒す'), B('boss_mecha', 'casino_f3', 'VIPフロアでメカ・ハイローラーを倒す')]),
  jobMission('jin_nitro_ace', 3, 'job_tiger', 'ニトロ・エースへの道',
    '元ストリートレース王者タイガーが、カジノ街の夜を支配する走りを求める。',
    ['ストリップの夜は速いやつのものだ。', 'とことん走り込んで、工事現場の建設ロボをなぎ倒してこい。'],
    ['ハッハー！ 今日からお前は「ニトロ・エース」！', 'この街の信号は、もうお前には関係ねえ。'],
    [D(1000, '車で走る（m）'), K('robot_worker', 25, 'tower_f1', '工事現場の足場で建設ロボを倒す')]),
  // ---- ルナ 4次（宇宙港 / セレス） ----
  jobMission('luna_galaxy_outlaw', 4, 'job_celes', 'ギャラクシー・アウトローへの道',
    '宇宙港の歌姫セレスの正体は銀河の賞金稼ぎ。最後の賞金首を追う。',
    ['あなたのウワサ、銀河の果てまで届いてるわ。', '謎の宇宙船のゼノメカを撃ち落として、オーバーロード・ゾグの首を取ってきて。'],
    ['銀河一の賞金首、誕生ね。今日からあなたは「ギャラクシー・アウトロー」。', '星の数だけ、あなたの伝説が増えていく。'],
    [K('robot_xeno', 30, 'space_f4', '謎の宇宙船でゼノメカを倒す'), B('boss_alien', 'space_f4', '謎の宇宙船でオーバーロード・ゾグを倒す')]),
  jobMission('luna_cosmo_star', 4, 'job_celes', 'コズミック・スターへの道',
    '全銀河配信のホログラム・ステージ。最後のステージは宇宙船の中。',
    ['最後のステージは宇宙よ。観客は…ちょっと怖いけど。', '宇宙船のアストラル体とヴォイドクラゲ、全員ファンにしてきて。'],
    ['銀河じゅうがアンコールしてる！ 今日からあなたは「コズミック・スター」。', '踊るたび、星が降るわ。'],
    [K('ghost_astral', 30, 'space_f4', '謎の宇宙船でアストラル体を倒す'), K('jelly_void', 25, 'space_f4', '謎の宇宙船でヴォイドクラゲを倒す')]),
  // ---- ジン 4次（宇宙港 / カイザー・マグナ） ----
  jobMission('jin_vice_legend', 4, 'job_kaiser', 'ネオン覇王への道',
    'かつて「覇王」と呼ばれた男、カイザー・マグナが最後の試練を課す。',
    ['覇王の名を継ぐか。ならば宇宙人だろうと膝をつかせろ。', '宇宙船のエイリアン戦士どもを叩き伏せ、オーバーロード・ゾグを拳で沈めてこい。'],
    ['…継いだな、覇王の名を。今日からお前が「ネオン覇王」だ。', 'もう誰も、お前の前には立てん。'],
    [K('alien_warrior', 30, 'space_f4', '謎の宇宙船でエイリアン戦士を倒す'), B('boss_alien', 'space_f4', '謎の宇宙船でオーバーロード・ゾグを倒す')]),
  jobMission('jin_warp_rider', 4, 'job_kaiser', 'ワープ・ライダーへの道',
    '光速を超える走りを求め、宇宙港の滑走路と宇宙船を駆け抜ける。',
    ['光より速く走れるやつを、俺は一人しか知らん。…昔の俺だ。', '限界まで走り込み、宇宙船のゼノメカを轢き飛ばしてこい。'],
    ['光を置き去りにしたな。今日からお前は「ワープ・ライダー」！', '次に走るのは…銀河の高速道路だ。'],
    [D(1500, '車で走る（m）'), K('robot_xeno', 30, 'space_f4', '謎の宇宙船でゼノメカを倒す')]),
  // ---- ハッカー 1次（ダウンタウン / ゼロ） ----
  jobMission('hk_netrunner', 1, 'job_zero', 'ネットランナーへの道',
    'ネットカフェ「ゼロ・ポイント」の店長ゼロが、電脳の才能を試す。',
    ['回線の向こうから見てたよ。君、コードの筋がいい。', '裏通りののぞき見ドローンをハックして落とし、ネオンキノコの胞子ネットを焼き切ってきて。'],
    ['ログ確認、完璧。今日から君は「ネットランナー」。', '街じゅうのネットワークが、君の走る道だ。'],
    [K('drone_peeping', 12, 'down_f1', 'ネオン裏通りでのぞき見ドローンを倒す'), K('mushroom_neon', 10, 'down_f1', 'ネオン裏通りでネオンキノコを倒す')]),
  jobMission('hk_drone_pilot', 1, 'job_zero', 'ドローン・パイロットへの道',
    'ゼロのガレージで、自作ドローンの実戦テスト。',
    ['そのドローン、自分で組んだの？ 面白い。実戦で飛ばしてみよう。', 'ハイウェイのカモメと空中戦、それからピア桟橋のキングゼリーを爆撃してきて。'],
    ['飛行ログ、文句なし。今日から君は「ドローン・パイロット」。', '相棒のドローン、君のこと気に入ったみたいだよ。'],
    [K('seagull_highway', 12, 'beach_f4', 'ハイウェイ入口でハイウェイカモメを倒す'), B('boss_king_slime', 'beach_f3', 'ピア桟橋でキングゼリーを倒す')]),
  // ---- ハッカー 2次（スラム / バイト） ----
  jobMission('hk_code_breaker', 2, 'job_byte', 'コード・ブレイカーへの道',
    '港の闇ジャンク屋バイトが、防壁破りの腕前を試す。',
    ['鍵のかかったものほど開けたくなる。だろ？', '廃線路のスクラップロボの制御を奪って、密輸船のキャプテン・ハーケンの金庫を開けてこい。'],
    ['…開いたか。今日からお前は「コード・ブレイカー」だ。', 'この港に、お前の開けられない扉はねえ。'],
    [K('robot_scrap', 20, 'slums_f4', '廃線路でスクラップロボを倒す'), B('boss_captain', 'slums_f3', '密輸船でキャプテン・ハーケンを倒す')]),
  jobMission('hk_swarm_commander', 2, 'job_byte', 'スウォーム・コマンダーへの道',
    'バイトのジャンクヤードで、ドローン編隊の指揮テスト。',
    ['一機じゃ足りねえ。群れで飛ばせ。', 'マングローブのオオヌマカと空中戦、廃線路のジャイアントラットを編隊で追い詰めてこい。'],
    ['見事な編隊飛行だ。今日からお前は「スウォーム・コマンダー」。', '空はもう、お前の陣地だ。'],
    [K('mosquito_giant', 20, 'swamp_f2', 'マングローブ迷路でオオヌマカを倒す'), K('rat_giant', 15, 'slums_f4', '廃線路でジャイアントラットを倒す')]),
  // ---- ハッカー 3次（ルーフトップ / サイファー） ----
  jobMission('hk_ghost_protocol', 3, 'job_cipher', 'ゴースト・プロトコルへの道',
    '摩天楼の屋上に潜む伝説のハッカー、サイファーの最終審査。',
    ['このビルのシステムは全部、私の庭。…あなたに奪えるかしら。', '工事現場のアサルトドローンを乗っ取って、VIPフロアのメカ・ハイローラーを停止させて。'],
    ['…痕跡ゼロ。今日からあなたは「ゴースト・プロトコル」。', '街の灯りは、あなたの指先ひとつ。'],
    [K('drone_attack', 25, 'tower_f1', '工事現場の足場でアサルトドローンを倒す'), B('boss_mecha', 'casino_f3', 'VIPフロアでメカ・ハイローラーを倒す')]),
  jobMission('hk_mecha_architect', 3, 'job_cipher', 'メカ・アーキテクトへの道',
    '屋上の秘密工房で、軍用ドローンの設計図を完成させる。',
    ['設計図には実戦データが要る。集めてきて。', 'VIPフロアのディーラーロボと工事現場のスチールゴーレム、ドローンで解体して解析データを取ってきて。'],
    ['美しい設計。今日からあなたは「メカ・アーキテクト」。', 'あなたの機体なら、空も地上も制圧できる。'],
    [K('robot_dealer', 25, 'casino_f3', 'VIPフロアでディーラーロボを倒す'), K('golem_steel', 20, 'tower_f1', '工事現場の足場でスチールゴーレムを倒す')]),
  // ---- ハッカー 4次（宇宙港 / クェーサー） ----
  jobMission('hk_cyber_oracle', 4, 'job_quasar', 'サイバー・オラクルへの道',
    '宇宙港の量子コンピュータ「クェーサー」が、接続者にふさわしいかを演算する。',
    ['……接続要求を受理。最終試験を開始する。', '宇宙船のアストラル体を解析し、オーバーロード・ゾグの思考回路を停止せよ。'],
    ['……演算完了。接続者を「サイバー・オラクル」と認定する。', 'あなたには、未来の分岐が見えるはずだ。'],
    [K('ghost_astral', 30, 'space_f4', '謎の宇宙船でアストラル体を倒す'), B('boss_alien', 'space_f4', '謎の宇宙船でオーバーロード・ゾグを倒す')]),
  jobMission('hk_orbital_master', 4, 'job_quasar', 'オービタル・マスターへの道',
    '衛星軌道のドローン網の管理権限を得るための最終試験。',
    ['……衛星軌道ネットワークの管理者候補を確認。', '宇宙船のゼノメカとエイリアン戦士を軌道兵器で殲滅せよ。'],
    ['……全衛星、あなたの指揮下に入った。称号「オービタル・マスター」を付与する。', '空の上から、街を守れ。'],
    [K('robot_xeno', 30, 'space_f4', '謎の宇宙船でゼノメカを倒す'), K('alien_warrior', 25, 'space_f4', '謎の宇宙船でエイリアン戦士を倒す')]),
];
list.push(...jobMissions);

const REWARD_EXP_FACTOR = { main: 0.8, sub: 0.5, daily: 0.3, job: 0.5 };
for (const m of list) {
  m.reward ||= {};
  if (!m.reward.expFixed) m.reward.exp = Math.round(expToNext((m.reqLevel || 1) + 2) * (REWARD_EXP_FACTOR[m.category] ?? 0.5));
}

export const MISSIONS = Object.fromEntries(list.map((m) => [m.id, m]));

export function getMission(id) { return MISSIONS[id] || null; }
export function turnInNpcOf(m) { return m.turnIn || m.giver; }
export const MAIN_STORY = list.filter((m) => m.category === 'main').map((m) => m.id);
/** v3: 転職ミッション（jobId → missionId） */
export const JOB_MISSIONS = Object.fromEntries(list.filter((m) => m.type === 'job').map((m) => [m.jobId, m.id]));
export function isJobMission(m) { return !!m && (typeof m === 'string' ? MISSIONS[m]?.type === 'job' : m.type === 'job'); }
