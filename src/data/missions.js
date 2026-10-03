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
  don_caiman:  { name: 'ドン・カイマン', mapId: 'casino',  role: '街を牛耳るカジノ王（黒幕）。ボス戦は rooftop の boss_don。' },
  nova:        { name: 'ノヴァ',        mapId: 'rooftop',  role: '天才ハッカー。最終決戦の案内役。' },
};

export const MAP_IDS = ['beach', 'downtown', 'slums', 'swamp', 'casino', 'rooftop'];

const list = [
  // ======================= メインストーリー =======================
  {
    id: 'm01_welcome', name: '第1話 ヴァイス・ベイへようこそ', category: 'main', giver: 'rico', reqLevel: 1, prereq: [],
    desc: '一文無しでバスを降りた二人。情報屋リコが最初の「仕事」をくれた。',
    dialog: {
      offer: ['よう、新入り。ここはヴァイス・ベイ、夢と札束の街さ。', 'まずは腕試しだ。ビーチのスライムを片付けてくれ。'],
      done: ['悪くない動きだ。この街でやっていけそうだな。'],
    },
    objectives: [{ type: 'kill', target: 'slime_green', count: 8, mapId: 'beach', text: 'ソーダスライムを倒す' }],
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
      { type: 'collect', target: 'slime_jelly', count: 10, mapId: 'beach', text: 'スライムゼリーを集める' },
      { type: 'kill', target: 'slime_pink', count: 6, mapId: 'beach', text: 'ストロベリースライムを倒す' },
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
      { type: 'kill', target: 'flamingo', count: 10, mapId: 'beach', text: 'ヤンキーフラミンゴを倒す' },
      { type: 'kill', target: 'mushroom_orange', count: 8, mapId: 'beach', text: 'ビーチマッシュを倒す' },
    ],
    reward: { exp: 220, money: 800, items: ['pistol_9mm', 'potion_blue', 'potion_blue'] },
  },
  {
    id: 'm04_rosa', name: '第4話 ママ・ローザの食堂', category: 'main', giver: 'rico', turnIn: 'mama_rosa', reqLevel: 8, prereq: ['m03_flamingo'],
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
    id: 'm05_protection', name: '第5話 みかじめ料はお断り', category: 'main', giver: 'mama_rosa', reqLevel: 10, prereq: ['m04_rosa'],
    desc: '食堂にたかるチンピラたち。ママのために追い払え。',
    dialog: {
      offer: ['最近チンピラどもが「みかじめ料」をせびりに来るんだよ。', 'あんたたちで懲らしめておくれ。'],
      done: ['見直したよ！ これは昔、亭主が使ってた刀さ。持っていきな。'],
    },
    objectives: [
      { type: 'kill', target: 'thug_punk', count: 15, mapId: 'downtown', text: 'ストリートチンピラを倒す' },
      { type: 'collect', target: 'street_tag', count: 8, mapId: 'downtown', text: 'ギャングのワッペンを集める' },
    ],
    reward: { exp: 700, money: 1500, items: ['katana_steel'] },
  },
  {
    id: 'm06_dirty_badge', name: '第6話 汚れたバッジ', category: 'main', giver: 'officer_kai', reqLevel: 13, prereq: ['m05_protection'],
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
  },
  {
    id: 'm07_wheels', name: '第7話 ネオンの足', category: 'main', giver: 'officer_kai', turnIn: 'tank', reqLevel: 16, prereq: ['m06_dirty_badge'],
    desc: '港のメカニック、タンクが「足」を用意してくれるらしい。',
    dialog: {
      offer: ['港のタンクに会え。車がなきゃこの街じゃ半人前だ。'],
      done: ['こいつは俺のチューンしたスポーツカーさ。いい走りだったろ？', 'ジン、運転はお前担当だな。ルナは…ナビ席で踊るなよ。'],
    },
    objectives: [
      { type: 'reach', target: 'slums', count: 1, text: '港（スラム）へ行く' },
      { type: 'talk', target: 'tank', count: 1, mapId: 'slums', text: 'タンクと話す' },
      { type: 'drive', target: 'any', count: 300, text: '車で走る（m）' },
    ],
    reward: { exp: 1500, money: 3000, items: ['boots_black', 'potion_orange', 'potion_orange'] },
  },
  {
    id: 'm08_rave', name: '第8話 地下レイブ・ナイト', category: 'main', giver: 'dj_pulse', reqLevel: 18, prereq: ['m07_wheels'],
    desc: 'DJパルスのレコードが港のゴロツキに盗まれた。今夜のレイブを救え。',
    dialog: {
      offer: ['ヘイ、そこのクールな二人！ 俺のレコードが盗まれたんだ！', 'ゴロツキどもから取り返してくれたら、ゲストリストに載せるぜ。'],
      done: ['最高だ！ 今夜のフロアは君たちのものさ。これ、俺の予備のヘッドホン。'],
    },
    objectives: [
      { type: 'kill', target: 'thug_dockhand', count: 15, mapId: 'slums', text: '港のゴロツキを倒す' },
      { type: 'collect', target: 'stolen_vinyl', count: 6, mapId: 'slums', text: '盗まれたレコードを取り返す' },
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
      { type: 'kill', target: 'gator_swamp', count: 15, mapId: 'swamp', text: '沼ワニを倒す' },
      { type: 'collect', target: 'gator_tooth', count: 10, mapId: 'swamp', text: 'ワニの牙を集める' },
    ],
    reward: { exp: 4500, money: 6000, items: ['cowboy_hat', 'potion_white', 'potion_white'] },
  },
  {
    id: 'm10_grandpa', name: '第10話 沼の主', category: 'main', giver: 'old_boone', reqLevel: 28, prereq: ['m09_swamp'],
    desc: '密輸船を守る巨大ワニ「グランパ・ゲイター」。こいつを倒せば道は開ける。',
    dialog: {
      offer: ['奥に「グランパ」がおる。ドンの連中が餌付けして番犬にしとるんじゃ。', 'あれを倒せる人間がいるとすれば、お前さんたちくらいじゃろう。'],
      done: ['信じられん…グランパを倒したのか！ 密輸船の積荷にカジノの名前があったぞ。'],
    },
    objectives: [{ type: 'boss', target: 'boss_gator', count: 1, mapId: 'swamp', text: 'グランパ・ゲイターを倒す' }],
    reward: { exp: 9000, money: 12000, items: ['katana_blood', 'elixir'], sp: 2 },
  },
  {
    id: 'm11_casino', name: '第11話 ハイローラー', category: 'main', giver: 'old_boone', turnIn: 'vivi', reqLevel: 34, prereq: ['m10_grandpa'],
    desc: 'カジノ「ネオン・パレス」に潜入。用心棒をかわし、内通者ヴィヴィと接触する。',
    dialog: {
      offer: ['ネオン・パレスに行け。ディーラーのヴィヴィはドンを憎んどる。'],
      done: ['あなたたちね、沼のグランパを倒したのは。', 'ドン・カイマンの金庫は最上階。でもまずは警備システムを潰さないと。'],
    },
    objectives: [
      { type: 'reach', target: 'casino', count: 1, text: 'カジノへ行く' },
      { type: 'kill', target: 'thug_bouncer', count: 20, mapId: 'casino', text: 'カジノの用心棒を倒す' },
      { type: 'collect', target: 'casino_chip', count: 15, mapId: 'casino', text: 'カジノチップを集める' },
    ],
    reward: { exp: 15000, money: 20000, items: ['suit_black', 'idol_dress'] },
  },
  {
    id: 'm12_mecha', name: '第12話 セキュリティ・ブレイク', category: 'main', giver: 'vivi', reqLevel: 40, prereq: ['m11_casino'],
    desc: 'カジノを守る巨大警備ドローン「メカ・ハイローラー」を破壊せよ。',
    dialog: {
      offer: ['警備システムの中枢は「メカ・ハイローラー」。ドローンも全部それに繋がってる。', '壊せば最上階へのエレベーターが動くわ。'],
      done: ['やった！ システムダウン！ …でも、ドンは屋上へ逃げたみたい。'],
    },
    objectives: [
      { type: 'kill', target: 'drone_casino', count: 15, mapId: 'casino', text: 'セキュリティドローンを倒す' },
      { type: 'boss', target: 'boss_mecha', count: 1, mapId: 'casino', text: 'メカ・ハイローラーを破壊する' },
    ],
    reward: { exp: 26000, money: 30000, items: ['guitar_thunder', 'sneakers_neon', 'elixir'], sp: 2 },
  },
  {
    id: 'm13_heat', name: '第13話 ヴァイス・ベイ大炎上', category: 'main', giver: 'officer_kai', reqLevel: 44, prereq: ['m12_mecha'],
    desc: 'ドンが警察を買収し、二人に全面手配が。カイと共に包囲網を突破しろ。',
    dialog: {
      offer: ['まずいことになった。ドンが署長を買収しやがった。お前らは今や街の最重要指名手配犯だ。', 'どうせなら派手にいけ。★4の包囲網をぶち破れ！'],
      done: ['ははっ、SWATまで蹴散らすとはな。俺もとうとう腹を括ったぜ。', 'ドンは摩天楼の屋上だ。ノヴァって奴が道を開けてくれる。'],
    },
    objectives: [
      { type: 'wanted', target: 4, count: 1, text: '手配度★4に到達' },
      { type: 'kill', target: 'swat_trooper', count: 10, text: 'SWAT隊員を倒す' },
    ],
    reward: { exp: 34000, money: 40000, items: ['armor_vest', 'armor_pants'] },
  },
  {
    id: 'm14_rooftop', name: '第14話 摩天楼の頂へ', category: 'main', giver: 'officer_kai', turnIn: 'nova', reqLevel: 48, prereq: ['m13_heat'],
    desc: '屋上へ続く道にはドンの殺し屋とアサルトドローン。ハッカーのノヴァと合流せよ。',
    dialog: {
      offer: ['屋上へ行け。ノヴァが待ってる。'],
      done: ['お待たせ、ヒーローさんたち。ドンのドローン網は私がハックしておいたわ。', 'あとは…あなたたちの拳と弾丸次第ね。'],
    },
    objectives: [
      { type: 'reach', target: 'rooftop', count: 1, text: '摩天楼の屋上へ行く' },
      { type: 'kill', target: 'thug_hitman', count: 15, mapId: 'rooftop', text: 'ドンの殺し屋を倒す' },
      { type: 'kill', target: 'drone_attack', count: 10, mapId: 'rooftop', text: 'アサルトドローンを倒す' },
    ],
    reward: { exp: 50000, money: 50000, items: ['wings_angel', 'elixir', 'elixir'], sp: 2 },
  },
  {
    id: 'm15_don', name: '最終話 ネオン・ヴァイス', category: 'main', giver: 'nova', reqLevel: 52, prereq: ['m14_rooftop'],
    desc: 'ヴァイス・ベイの支配者ドン・カイマンとの最終決戦。',
    dialog: {
      offer: ['ドン・カイマンはヘリポートにいる。逃げられる前に決着を。', 'この街の夜明けを、あなたたちの手で。'],
      done: ['…やったのね。ドンの時代は終わった。', '今日からこの街の夜は、あなたたち二人のもの。ようこそ、新しいボスさん。'],
    },
    objectives: [{ type: 'boss', target: 'boss_don', count: 1, mapId: 'rooftop', text: 'ドン・カイマンを倒す' }],
    reward: { exp: 120000, money: 200000, items: ['crown_neon', 'neon_sword'], sp: 3, flag: 'storyClear' },
  },

  // ======================= サブ =======================
  {
    id: 's01_feathers', name: 'サニーのピンク羽', category: 'sub', giver: 'sunny', reqLevel: 6, prereq: [],
    desc: 'ビーチ売店の新作お土産に、フラミンゴの羽が必要。',
    dialog: { offer: ['新作のドリームキャッチャーを作りたいの！ フラミンゴの羽を集めてくれない？'], done: ['わぁ、きれい！ お礼にこのサンダルどうぞ！'] },
    objectives: [{ type: 'collect', target: 'flamingo_feather', count: 8, mapId: 'beach', text: 'フラミンゴの羽を集める' }],
    reward: { exp: 200, money: 600, items: ['sandals_beach', 'potion_red', 'potion_red'] },
  },
  {
    id: 's02_king_slime', name: 'ビーチの王様', category: 'sub', giver: 'sunny', reqLevel: 10, prereq: ['s01_feathers'],
    desc: '夕暮れのビーチに巨大なスライム「キングゼリー」が現れるらしい。',
    dialog: { offer: ['夕方になるとね、すっごく大きいスライムが出るの…海水浴客が怖がってるわ。'], done: ['本当に倒しちゃったの！？ あなたたち、ビーチのヒーローね！'] },
    objectives: [{ type: 'boss', target: 'boss_king_slime', count: 1, mapId: 'beach', text: 'キングゼリーを倒す' }],
    reward: { exp: 900, money: 2000, items: ['gold_chain'], sp: 1 },
  },
  {
    id: 's03_mushroom_soup', name: 'ママの秘伝スープ', category: 'sub', giver: 'mama_rosa', reqLevel: 11, prereq: ['m04_rosa'],
    desc: 'ママ・ローザの名物スープにはネオンキノコが欠かせない。',
    dialog: { offer: ['スープの材料が切れちまってね。キノコのかさを集めておくれ。'], done: ['これでまた店を開けられるよ。ほら、まかないのドリンクだ。'] },
    objectives: [
      { type: 'kill', target: 'mushroom_neon', count: 12, mapId: 'downtown', text: 'ネオンキノコを倒す' },
      { type: 'collect', target: 'mushroom_cap', count: 15, text: 'キノコのかさを集める' },
    ],
    reward: { exp: 800, money: 1800, items: ['drink_energy', 'drink_energy', 'potion_orange', 'potion_orange'] },
  },
  {
    id: 's04_toxic', name: '港の大掃除', category: 'sub', giver: 'tank', reqLevel: 20, prereq: ['m07_wheels'],
    desc: 'ガレージの排水口がヘドロスライムで詰まった。',
    dialog: { offer: ['排水口からヘドロスライムが湧いてきやがる。エンジンが錆びちまうぜ。'], done: ['助かった！ こいつは客の忘れ物だ、使ってくれ。'] },
    objectives: [{ type: 'kill', target: 'slime_toxic', count: 20, mapId: 'slums', text: 'ヘドロスライムを倒す' }],
    reward: { exp: 2200, money: 3500, items: ['track_pants'] },
  },
  {
    id: 's05_albino', name: '白い悪魔', category: 'sub', giver: 'old_boone', reqLevel: 30, prereq: ['m09_swamp'],
    desc: '幻のアルビノゲイター。その鱗は高値で売れる。',
    dialog: { offer: ['白いワニを見たことがあるか？ あれの鱗は金より価値がある。'], done: ['見事じゃ。わしの若い頃の帽子をやろう。'] },
    objectives: [
      { type: 'kill', target: 'gator_albino', count: 10, mapId: 'swamp', text: 'アルビノゲイターを倒す' },
      { type: 'collect', target: 'gator_scale', count: 3, mapId: 'swamp', text: 'アルビノの鱗を集める' },
    ],
    reward: { exp: 6000, money: 8000, items: ['helmet_moto'] },
  },
  {
    id: 's06_gold_rush', name: 'ゴールドラッシュ', category: 'sub', giver: 'vivi', reqLevel: 42, prereq: ['m11_casino'],
    desc: 'カジノの金庫からゴールドスライムが逃げ出した！',
    dialog: { offer: ['内緒よ？ 金庫の中でゴールドスライムを飼ってたの。逃げちゃったけど。'], done: ['ふふ、お礼はたっぷり弾むわ。'] },
    objectives: [
      { type: 'kill', target: 'slime_gold', count: 15, mapId: 'casino', text: 'ゴールドスライムを倒す' },
      { type: 'collect', target: 'gold_bar', count: 2, text: '金の延べ棒を集める' },
    ],
    reward: { exp: 18000, money: 30000, items: ['drink_lucky', 'gold_chain_heavy'] },
  },
  {
    id: 's07_rave_drive', name: 'ミッドナイト・ドライブ', category: 'sub', giver: 'dj_pulse', reqLevel: 20, prereq: ['m08_rave'],
    desc: 'レイブの宣伝のため、ネオン街を車で流してほしい。',
    dialog: { offer: ['俺の新曲を爆音で流しながら街を走ってくれ！ 最高の宣伝になる！'], done: ['街中で噂になってるぜ！ サンキュー！'] },
    objectives: [{ type: 'drive', target: 'any', count: 800, text: '車で走る（m）' }],
    reward: { exp: 2600, money: 5000, items: ['sunglasses_neon'] },
  },

  // ======================= デイリー（1日1回） =======================
  {
    id: 'd01_beach_patrol', name: '[デイリー] ビーチパトロール', category: 'daily', daily: true, giver: 'sunny', reqLevel: 3, prereq: [],
    desc: '毎日のビーチ清掃。', dialog: { offer: ['今日もスライムが大発生！ 手伝って！'], done: ['ありがと！ また明日もよろしくね！'] },
    objectives: [{ type: 'kill', target: 'slime_pink', count: 20, mapId: 'beach', text: 'ストロベリースライムを倒す' }],
    reward: { exp: 150, money: 800, items: ['potion_red', 'potion_red', 'potion_red', 'potion_red', 'potion_red'] },
  },
  {
    id: 'd02_street_sweep', name: '[デイリー] ストリート・スウィープ', category: 'daily', daily: true, giver: 'mama_rosa', reqLevel: 12, prereq: ['m05_protection'],
    desc: '懲りないチンピラを毎日お掃除。', dialog: { offer: ['またあの連中が来てるよ。頼んだよ！'], done: ['助かるねぇ。今日のまかないだよ。'] },
    objectives: [{ type: 'kill', target: 'thug_punk', count: 25, mapId: 'downtown', text: 'ストリートチンピラを倒す' }],
    reward: { exp: 1200, money: 2500, items: ['potion_orange', 'potion_orange', 'potion_orange', 'potion_blue', 'potion_blue'] },
  },
  {
    id: 'd03_heat_check', name: '[デイリー] ヒート・チェック', category: 'daily', daily: true, giver: 'officer_kai', reqLevel: 15, prereq: ['m06_dirty_badge'],
    desc: '署の目をそらすための陽動。', dialog: { offer: ['今日も騒いでくれ。★3だ。'], done: ['いい仕事だ。いつもの封筒だ。'] },
    objectives: [{ type: 'wanted', target: 3, count: 1, text: '手配度★3に到達' }],
    reward: { exp: 2000, money: 6000, items: [] },
  },
  {
    id: 'd04_delivery', name: '[デイリー] デリバリー・ラン', category: 'daily', daily: true, giver: 'tank', reqLevel: 16, prereq: ['m07_wheels'],
    desc: 'パーツの配達。とにかく走れ。', dialog: { offer: ['今日の配達だ。ぶっ飛ばしてこい！'], done: ['タイム更新だな！'] },
    objectives: [{ type: 'drive', target: 'any', count: 500, text: '車で走る（m）' }],
    reward: { exp: 1800, money: 4000, items: ['drink_energy'] },
  },
  {
    id: 'd05_swamp_hunt', name: '[デイリー] ワニ狩り', category: 'daily', daily: true, giver: 'old_boone', reqLevel: 26, prereq: ['m09_swamp'],
    desc: 'ワニの牙は毎日需要がある。', dialog: { offer: ['今日も牙を頼むぞ。'], done: ['ほい、今日の稼ぎじゃ。'] },
    objectives: [{ type: 'collect', target: 'gator_tooth', count: 15, mapId: 'swamp', text: 'ワニの牙を集める' }],
    reward: { exp: 5000, money: 9000, items: ['potion_white', 'potion_white', 'potion_mana'] },
  },
  {
    id: 'd06_high_stakes', name: '[デイリー] ハイステークス', category: 'daily', daily: true, giver: 'vivi', reqLevel: 36, prereq: ['m11_casino'],
    desc: 'カジノチップを両替して一儲け。', dialog: { offer: ['チップを集めてきて。いいレートで換金してあげる。'], done: ['今日もあなたの勝ちね。'] },
    objectives: [{ type: 'collect', target: 'casino_chip', count: 20, mapId: 'casino', text: 'カジノチップを集める' }],
    reward: { exp: 12000, money: 25000, items: ['power_elixir'] },
  },
  {
    id: 'd07_rooftop_contract', name: '[デイリー] 屋上の掃除屋', category: 'daily', daily: true, giver: 'nova', reqLevel: 50, prereq: ['m14_rooftop'],
    desc: 'ドンの残党狩り。', dialog: { offer: ['残党がまだ屋上にいるわ。片付けて。'], done: ['ナイス。報酬は振り込んでおいたわ。'] },
    objectives: [
      { type: 'kill', target: 'thug_hitman', count: 20, mapId: 'rooftop', text: 'ドンの殺し屋を倒す' },
      { type: 'kill', target: 'swat_heavy', count: 5, mapId: 'rooftop', text: 'ヘビーSWATを倒す' },
    ],
    reward: { exp: 40000, money: 60000, items: ['elixir', 'drink_lucky'] },
  },
];

export const MISSIONS = Object.fromEntries(list.map((m) => [m.id, m]));

export function getMission(id) { return MISSIONS[id] || null; }
export function turnInNpcOf(m) { return m.turnIn || m.giver; }
export const MAIN_STORY = list.filter((m) => m.category === 'main').map((m) => m.id);
