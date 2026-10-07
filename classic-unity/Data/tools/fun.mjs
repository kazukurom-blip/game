// 「楽しさの要素」のデータ（→ classic-unity/Data/fun.json と items.json の品）。Core は Core/Fun/ が読む。
// 横スクロールの MMO によくある遊びの「仕組みの形」だけを借りた物で、名前・文章・景品・絵はすべてオリジナル。
//
//   1. 景品の機械（ガチャ）: 大陸の町ごとに 1 台。券を入れると、その町の景品の表から 1 つ（ふつう・少し珍しい・大当たり）
//   2. フィールドボス: 決まったマップに、遊んでいる時間で 30〜90 分おきに 1 体（classic/tools/data/fun_mobs.mjs）
//   3. 船の旅と襲撃: 雲の船は C118（船の上）で 1〜2 分の旅。途中で空の魔物が乗り込んでくる
//   4. 感情表現: 7 つ（数秒で戻る）
//   5. 遊び場: 五目並べ（15×15）・神経衰弱。勝つと点数、点数で景品
//   6. 季節の祭り: 実際の日付（秋・冬）で町の飾り・季節の敵・頼みごと・景品
//   7. 美容院: 髪型・髪の色・顔・肌の色
//   8. 珍しい色違いの敵: どの狩り場でも 1/300 で「珍しい個体」
//   9. 1 人用ダンジョンの部屋ごとの課題・ごほうびの部屋・踏破の印の交換
//  10. 見た目の品の店: 名札・吹き出し・見た目だけの帽子・服
//  11. 天気: マップと時間（実時間の 1 時間ごと）で雨・雪・花びら・霧
//
// 町の機械・係（spots）は NPC ではなく、生成したマップの地面の空いている所に書き出しの時に置く（ほかの NPC・ポータルから 70 px 以上）。
import { FIELD_BOSSES, SEASON_MOBS } from '../../../classic/tools/data/fun_mobs.mjs';

// ---------------------------------------------------------------- 品
// [ID, 名前, タブ, 追加]。fun: 見た目の品（kind: hat / outfit / tag / bubble、look: 絵の部品の名前）。使うと着ける・外す（減らない）
const LOOK = (kind, look, desc) => ({ fun: { kind, look }, desc: desc + '（見た目だけ。使うと着ける・もう一度で外す）' });
const CHAIR = (desc) => ({ chair: { regenMul: 1.5 }, desc: desc + '（座ると回復が 1.5 倍）' });
export const FUN_ITEMS = [
  ['use.gacha_ticket', '景品の機械の券', 'use', { desc: '町の景品の機械に入れると、景品が 1 つ出てくる', sellPrice: 300 }],
  ['use.fun.hair_coupon', '髪型の券', 'use', { desc: '美容院で髪型か髪の色を 1 回変えられる', sellPrice: 500 }],
  ['use.fun.face_coupon', '顔の券', 'use', { desc: '美容院で顔（目）か肌の色を 1 回変えられる', sellPrice: 500 }],
  ['etc.fun.dungeon_mark', '踏破の印', 'etc', { desc: '1 人用ダンジョンを踏破した証。市場の印の交換所で品と替えられる', sellPrice: 1 }],
  // 見た目の帽子
  ['setup.fun.hat.acorn', 'どんぐり帽子', 'setup', LOOK('hat', 'hat_acorn', 'どんぐりのかさの形の帽子')],
  ['setup.fun.hat.cat', 'ねこ耳の帽子', 'setup', LOOK('hat', 'hat_cat', '三角の耳がついた帽子')],
  ['setup.fun.hat.crown', '紙の王冠', 'setup', LOOK('hat', 'hat_crown', '色紙で作った王冠')],
  ['setup.fun.hat.chef', 'コック帽', 'setup', LOOK('hat', 'hat_chef', '背の高い白い帽子')],
  ['setup.fun.hat.witch', 'とんがり帽子', 'setup', LOOK('hat', 'hat_witch', '先の折れたとんがり帽子')],
  ['setup.fun.hat.leaf', '葉っぱの帽子', 'setup', LOOK('hat', 'hat_leaf', '大きな葉っぱを 1 枚のせただけ')],
  ['setup.fun.hat.pirate', '小さな船長帽', 'setup', LOOK('hat', 'hat_pirate', '港の子どもに人気の帽子')],
  ['setup.fun.hat.star', '星の髪飾り', 'setup', LOOK('hat', 'hat_star', '小さな星が光る髪飾り')],
  ['setup.fun.hat.pumpkin', 'カボチャの帽子', 'setup', LOOK('hat', 'hat_pumpkin', '実りの祭りの記念の帽子')],
  ['setup.fun.hat.snow', '雪の結晶の帽子', 'setup', LOOK('hat', 'hat_snow', '雪の祭りの記念の帽子')],
  ['setup.fun.hat.stump', '切り株の帽子', 'setup', LOOK('hat', 'hat_stump', 'ねじれ根のモクモクのこぶを削った帽子')],
  ['setup.fun.hat.sheep', '金の羊毛の帽子', 'setup', LOOK('hat', 'hat_sheep', '日だまりの大羊の毛で編んだ帽子')],
  // 見た目の服
  ['setup.fun.outfit.sailor', '水兵の服', 'setup', LOOK('outfit', 'sailor', '白と紺の水兵の服')],
  ['setup.fun.outfit.festival', '祭りの法被', 'setup', LOOK('outfit', 'festival', '赤い祭りの上着')],
  ['setup.fun.outfit.formal', '黒い礼服', 'setup', LOOK('outfit', 'formal', 'よそ行きの黒い服')],
  ['setup.fun.outfit.farmer', '畑仕事の服', 'setup', LOOK('outfit', 'farmer', '緑の上着と茶色のズボン')],
  ['setup.fun.outfit.snow', '雪の外套', 'setup', LOOK('outfit', 'snow', '白いふかふかの外套')],
  ['setup.fun.outfit.star', '星空の服', 'setup', LOOK('outfit', 'star', '夜空の色の服')],
  // 名札（名前の下の札）
  ['setup.fun.tag.wood', '木の名札', 'setup', LOOK('tag', 'wood', '名前の下に木の札')],
  ['setup.fun.tag.gold', '金の名札', 'setup', LOOK('tag', 'gold', '名前の下に金の札')],
  ['setup.fun.tag.sakura', '花の名札', 'setup', LOOK('tag', 'sakura', '名前の下に花色の札')],
  ['setup.fun.tag.star', '星の名札', 'setup', LOOK('tag', 'star', '名前の下に星の札')],
  ['setup.fun.tag.ice', '氷の名札', 'setup', LOOK('tag', 'ice', '名前の下に氷の札')],
  // 吹き出し（会話・感情表現の時）
  ['setup.fun.bubble.cloud', '雲の吹き出し', 'setup', LOOK('bubble', 'cloud', '会話と感情表現の吹き出しが雲の形に')],
  ['setup.fun.bubble.heart', 'ハートの吹き出し', 'setup', LOOK('bubble', 'heart', '会話と感情表現の吹き出しが桃色に')],
  ['setup.fun.bubble.scroll', '巻物の吹き出し', 'setup', LOOK('bubble', 'scroll', '会話と感情表現の吹き出しが巻物に')],
  ['setup.fun.bubble.neon', '光る吹き出し', 'setup', LOOK('bubble', 'neon', '会話と感情表現の吹き出しが光る')],
  ['setup.fun.bubble.leaf', '葉っぱの吹き出し', 'setup', LOOK('bubble', 'leaf', '会話と感情表現の吹き出しが緑に')],
  // 椅子
  ['setup.fun.chair.capsule', 'カプセルの椅子', 'setup', CHAIR('景品の機械のカプセルの形')],
  ['setup.fun.chair.swing', '木のブランコ', 'setup', CHAIR('ゆらゆら揺れるブランコ')],
  ['setup.fun.chair.mushroom', 'キノコの腰かけ', 'setup', CHAIR('赤いかさのキノコ')],
  ['setup.fun.chair.puff', 'わたぐもの椅子', 'setup', CHAIR('ふわふわの雲')],
  ['setup.fun.chair.shell', '大貝の椅子', 'setup', CHAIR('海の底の大きな貝')],
  ['setup.fun.chair.ice', '氷の玉座', 'setup', CHAIR('ひんやりした氷の椅子')],
  ['setup.fun.chair.drum', '太鼓の椅子', 'setup', CHAIR('座るとぽこんと鳴る')],
  ['setup.fun.chair.lantern', '灯籠の縁台', 'setup', CHAIR('実りの祭りの縁台')],
  ['setup.fun.chair.snowglobe', '雪の玉の椅子', 'setup', CHAIR('雪の祭りのガラスの玉')],
  ['setup.fun.chair.nest', '翼竜の巣の椅子', 'setup', CHAIR('古巣の翼竜ゴウヨクの巣のかけら')],
];
// 大当たり・ボスの装備（[ID, 名前, 部位, 必要 Lv, 能力の文, 説明]）。職を問わない。強化の書 7 回
export const FUN_EQUIPS = [
  ['eq.fun.jackpot.V100', '港風のマント', 'cape', 10, 'STR+2 DEX+2 INT+2 LUK+2 防御+8 回避+4', '港の景品の機械の大当たり'],
  ['eq.fun.jackpot.C100', '雲織りの首飾り', 'pendant', 30, 'STR+3 DEX+3 INT+3 LUK+3 HP+60 MP+60', 'セレスの景品の機械の大当たり'],
  ['eq.fun.jackpot.T100', 'ぜんまいの耳飾り', 'earring', 30, 'STR+3 DEX+3 INT+3 LUK+3 魔防+20 命中+5', 'ティンクルの景品の機械の大当たり'],
  ['eq.fun.jackpot.F100', '霜の花のマント', 'cape', 50, 'STR+4 DEX+4 INT+4 LUK+4 防御+25 魔防+25', 'ヒョウガ村の景品の機械の大当たり'],
  ['eq.fun.jackpot.M100', '真珠の首飾り', 'pendant', 60, 'STR+5 DEX+5 INT+5 LUK+5 HP+150 MP+150', 'マリナの景品の機械の大当たり'],
  ['eq.fun.jackpot.D100', '竜鱗の耳飾り', 'earring', 100, 'STR+6 DEX+6 INT+6 LUK+6 攻撃力+3 魔力+3', '竜の背の村の景品の機械の大当たり'],
  ['eq.fun.boss.M420', 'ねじれ根の腕輪', 'gloves', 18, 'STR+2 DEX+2 防御+10 攻撃力+1', 'フィールドボス「ねじれ根のモクモク」だけが落とす'],
  ['eq.fun.boss.M421', 'ガンタの牙の首飾り', 'pendant', 28, 'STR+4 HP+80 攻撃力+1', 'フィールドボス「牙折れの大猪ガンタ」だけが落とす'],
  ['eq.fun.boss.M422', 'ぬめり玉の耳飾り', 'earring', 35, 'INT+4 LUK+2 魔防+15 MP+80', 'フィールドボス「沼の主ヌルヌマ」だけが落とす'],
  ['eq.fun.boss.M423', '金の羊毛のマント', 'cape', 45, 'STR+3 DEX+3 INT+3 LUK+3 防御+20', 'フィールドボス「日だまりの大羊メェロン」だけが落とす'],
  ['eq.fun.boss.M424', '大熊の毛皮の手袋', 'gloves', 55, 'STR+3 DEX+3 防御+30 攻撃力+2', 'フィールドボス「雪かぶりの大熊ユキゴロウ」だけが落とす'],
  ['eq.fun.boss.M425', '古傷の歯の首飾り', 'pendant', 62, 'DEX+5 LUK+5 HP+120 回避+6', 'フィールドボス「傷だらけの大鮫ギザ」だけが落とす'],
  ['eq.fun.boss.M426', '風切り羽のマント', 'cape', 110, 'STR+6 DEX+6 INT+6 LUK+6 防御+50 速さ+5', 'フィールドボス「古巣の翼竜ゴウヨク」だけが落とす'],
  ['eq.fun.boss.M427', '迷い星の指輪', 'ring', 160, 'STR+8 DEX+8 INT+8 LUK+8 攻撃力+4 魔力+4', 'フィールドボス「迷い星の巨人」だけが落とす'],
];
// 図鑑のカード: 景品の機械ごとに、その地域の敵 3 種（[機械の町, 敵]）
const CARD_MOBS = {
  V100: ['M001', 'M005', 'M030'], C100: ['M100', 'M101', 'M102'], T100: ['M140', 'M141', 'M145'],
  F100: ['M120', 'M123', 'M124'], M100: ['M170', 'M175', 'M176'], D100: ['M200', 'M201', 'M202'],
};

// ---------------------------------------------------------------- 1. 景品の機械
// tier: 0 ふつう / 1 少し珍しい / 2 大当たり。w は重み（確率 = w ÷ 合計。窓に出す）
const P = (item, w, tier = 0, n = 1) => ({ item, n, tier, w });
// 図鑑のカード（card.<敵>）は持ち物ではなく図鑑に入る（Core の GameSession.Collection.cs）
const cards = (town) => CARD_MOBS[town].map((m) => P(`card.${m}`, 8));
const GACHA = [
  { town: 'V100', name: '港のガラガラ', prizes: [
    ...cards('V100'), P('use.orange_potion', 14, 0, 10), P('use.blue_potion', 12, 0, 10), P('use.speed_tonic', 8, 0, 3),
    P('setup.fun.hat.acorn', 5, 1), P('setup.fun.hat.pirate', 5, 1), P('setup.fun.chair.mushroom', 4, 1), P('setup.fun.tag.wood', 4, 1), P('scroll.A17.60', 3, 1),
    P('eq.fun.jackpot.V100', 2, 2), P('setup.fun.chair.capsule', 1, 2) ] },
  { town: 'C100', name: '雲の上のくじ箱', prizes: [
    ...cards('C100'), P('use.white_potion', 14, 0, 10), P('use.mana_elixir', 12, 0, 5), P('use.magic_tonic', 8, 0, 3),
    P('setup.fun.hat.star', 5, 1), P('setup.fun.chair.puff', 5, 1), P('setup.fun.bubble.cloud', 4, 1), P('setup.fun.outfit.sailor', 4, 1), P('scroll.A26.60', 3, 1),
    P('eq.fun.jackpot.C100', 2, 2), P('setup.fun.chair.capsule', 1, 2) ] },
  { town: 'T100', name: 'ぜんまい仕掛けの景品箱', prizes: [
    ...cards('T100'), P('use.white_potion', 14, 0, 10), P('use.mana_elixir', 12, 0, 5), P('use.power_tonic', 8, 0, 3),
    P('setup.fun.hat.crown', 5, 1), P('setup.fun.chair.drum', 5, 1), P('setup.fun.bubble.neon', 4, 1), P('setup.fun.tag.star', 4, 1), P('scroll.A18.60', 3, 1),
    P('eq.fun.jackpot.T100', 2, 2), P('setup.fun.chair.capsule', 1, 2) ] },
  { town: 'F100', name: '雪の村の福引き', prizes: [
    ...cards('F100'), P('use.big_white_potion', 14, 0, 5), P('use.mana_elixir', 12, 0, 8), P('use.aim_tonic', 8, 0, 3),
    P('setup.fun.hat.cat', 5, 1), P('setup.fun.chair.ice', 5, 1), P('setup.fun.tag.ice', 4, 1), P('setup.fun.outfit.snow', 4, 1), P('scroll.A28.60', 3, 1),
    P('eq.fun.jackpot.F100', 2, 2), P('setup.fun.chair.capsule', 1, 2) ] },
  { town: 'M100', name: '海の底の貝くじ', prizes: [
    ...cards('M100'), P('use.big_white_potion', 14, 0, 8), P('use.blue_secret', 12, 0, 3), P('use.dodge_tonic', 8, 0, 3),
    P('setup.fun.hat.chef', 5, 1), P('setup.fun.chair.shell', 5, 1), P('setup.fun.bubble.scroll', 4, 1), P('setup.fun.outfit.formal', 4, 1), P('scroll.A29.60', 3, 1),
    P('eq.fun.jackpot.M100', 2, 2), P('setup.fun.chair.capsule', 1, 2) ] },
  { town: 'D100', name: '竜の背の宝くじ', prizes: [
    ...cards('D100'), P('use.xl_potion', 14, 0, 5), P('use.blue_secret', 12, 0, 5), P('use.warrior_elixir', 8, 0, 2),
    P('setup.fun.hat.witch', 5, 1), P('setup.fun.chair.swing', 5, 1), P('setup.fun.bubble.heart', 4, 1), P('setup.fun.outfit.star', 4, 1), P('scroll.A24.60', 3, 1),
    P('eq.fun.jackpot.D100', 2, 2), P('setup.fun.chair.capsule', 1, 2) ] },
];

// ---------------------------------------------------------------- 3. 船の旅（雲の船。乗るとすぐ C118 の船の上へ、sec 秒で着く）
// raids: 旅の途中の at（0〜1 の割合）の時に、mobs から count 体が乗り込んでくる。全部倒すと bonusMeso と、chance で券
const VOYAGES = [
  { npc: 'noa', deck: 'C118', sec: 75, raids: [{ at: 0.35, mobs: ['M100'], count: 3 }, { at: 0.7, mobs: ['M100'], count: 3 }], bonusMeso: 800, ticketChance: 0.2 },
  { npc: 'luna', deck: 'C118', sec: 75, raids: [{ at: 0.35, mobs: ['M100'], count: 3 }, { at: 0.7, mobs: ['M100'], count: 3 }], bonusMeso: 800, ticketChance: 0.2 },
  { npc: 'sora', deck: 'C118', sec: 90, raids: [{ at: 0.3, mobs: ['M100', 'M101'], count: 3 }, { at: 0.65, mobs: ['M101'], count: 4 }], bonusMeso: 1200, ticketChance: 0.2 },
  { npc: 'kippu', deck: 'C118', sec: 90, raids: [{ at: 0.3, mobs: ['M100', 'M101'], count: 3 }, { at: 0.65, mobs: ['M101'], count: 4 }], bonusMeso: 1200, ticketChance: 0.2 },
  { npc: 'hashi', deck: 'C118', sec: 110, raids: [{ at: 0.3, mobs: ['M101', 'M102'], count: 4 }, { at: 0.65, mobs: ['M102'], count: 5 }], bonusMeso: 3000, ticketChance: 0.3 },
  { npc: 'p_boat', deck: 'C118', sec: 110, raids: [{ at: 0.3, mobs: ['M101', 'M102'], count: 4 }, { at: 0.65, mobs: ['M102'], count: 5 }], bonusMeso: 3000, ticketChance: 0.3 },
];

// ---------------------------------------------------------------- 4. 感情表現（face: 絵の部品の名前。仮のアバターの顔）
const EMOTES = [
  { id: 'smile', name: 'にっこり', face: 'face_e_smile' },
  { id: 'cry', name: '泣く', face: 'face_e_cry' },
  { id: 'angry', name: '怒る', face: 'face_e_angry' },
  { id: 'surprise', name: '驚く', face: 'face_e_surprise' },
  { id: 'shy', name: '照れる', face: 'face_e_shy' },
  { id: 'sleepy', name: '眠い', face: 'face_e_sleepy' },
  { id: 'wink', name: 'ウインク', face: 'face_e_wink' },
];

// ---------------------------------------------------------------- 5. 遊び場
const ARCADE = {
  gomoku: { size: 15, points: { easy: [20, 8, 3], normal: [50, 15, 5] } }, // [勝ち, 引き分け, 負け]
  memory: { pairs: 8, recall: { easy: 0.35, normal: 0.7 }, points: { easy: [20, 8, 3], normal: [45, 15, 5] } },
  prizes: [
    { item: 'use.gacha_ticket', cost: 40 }, { item: 'use.exp_coupon', cost: 120 }, { item: 'use.fun.hair_coupon', cost: 100 },
    { item: 'use.fun.face_coupon', cost: 100 }, { item: 'setup.fun.tag.sakura', cost: 150 }, { item: 'setup.fun.bubble.leaf', cost: 150 },
    { item: 'setup.fun.outfit.farmer', cost: 200 }, { item: 'setup.fun.hat.leaf', cost: 200 }, { item: 'setup.fun.chair.swing', cost: 300 },
    { item: 'setup.fun.chair.drum', cost: 300 },
  ],
};

// ---------------------------------------------------------------- 6. 季節の祭り（実際の日付の月。Clock の時差込み）
const SEASONS = [
  { id: 'autumn', name: '実りの祭り', months: [9, 10, 11], deco: 'autumn', mob: 'M430', mobChance: 0.08, task: { item: 'etc.M430', count: 20, first: [{ item: 'setup.fun.hat.pumpkin', n: 1 }, { item: 'setup.fun.chair.lantern', n: 1 }], again: [{ item: 'use.gacha_ticket', n: 2 }] },
    prizes: ['setup.fun.hat.pumpkin', 'setup.fun.chair.lantern'], say: '実りの祭りだよ！ 畑に出るおばけカボチャの種を 20 個集めてくれたら、記念の品をあげよう。' },
  { id: 'winter', name: '雪の祭り', months: [12, 1, 2], deco: 'winter', mob: 'M431', mobChance: 0.08, task: { item: 'etc.M431', count: 20, first: [{ item: 'setup.fun.hat.snow', n: 1 }, { item: 'setup.fun.chair.snowglobe', n: 1 }], again: [{ item: 'use.gacha_ticket', n: 2 }] },
    prizes: ['setup.fun.hat.snow', 'setup.fun.chair.snowglobe'], say: '雪の祭りだよ！ 転がる雪だるまの結晶を 20 個集めてくれたら、記念の品をあげよう。' },
];

// ---------------------------------------------------------------- 7. 美容院
const SALON = {
  hair: [['hair_spiky', 'とがった短い髪'], ['hair_bob', 'まるいボブ'], ['hair_long', '長い髪'], ['hair_pony', 'ポニーテール'], ['hair_bun', 'おだんご'], ['hair_curly', 'くせっ毛'], ['hair_mohawk', 'とさか頭']],
  hairColor: [['brown', '茶'], ['black', '黒'], ['blond', '金'], ['red', '赤'], ['silver', '銀'], ['blue', '青'], ['pink', '桃'], ['green', '緑']],
  face: [['face_basic', 'ふつうの目'], ['face_round', 'まるい目'], ['face_sharp', 'きりっとした目'], ['face_calm', 'おだやかな目'], ['face_sparkle', 'きらきらの目']],
  skin: [['light', '明るい肌'], ['tan', '小麦色'], ['pale', '白い肌'], ['dark', '褐色']],
  price: { hair: 5000, hairColor: 3000, face: 8000, skin: 3000 },
  coupon: { hair: 'use.fun.hair_coupon', hairColor: 'use.fun.hair_coupon', face: 'use.fun.face_coupon', skin: 'use.fun.face_coupon' },
};

// ---------------------------------------------------------------- 10. 見た目の品の店（お金で買う）
const BOUTIQUE = [
  ['setup.fun.tag.wood', 3000], ['setup.fun.tag.gold', 30000], ['setup.fun.tag.star', 15000],
  ['setup.fun.bubble.cloud', 8000], ['setup.fun.bubble.heart', 8000], ['setup.fun.bubble.scroll', 12000],
  ['setup.fun.hat.cat', 10000], ['setup.fun.hat.chef', 10000], ['setup.fun.hat.crown', 20000],
  ['setup.fun.outfit.sailor', 15000], ['setup.fun.outfit.festival', 15000], ['setup.fun.outfit.formal', 25000],
  ['use.gacha_ticket', 1500],
];

// ---------------------------------------------------------------- 8. 珍しい色違いの敵
const RARE = { chance: 1 / 300, hpMul: 3, atkMul: 1.3, expMul: 5, dropRolls: 3, mesoMul: 3, bonus: [{ item: 'use.gacha_ticket', chance: 0.5 }] };

// ---------------------------------------------------------------- 9. 1 人用ダンジョン（壁で区切った部屋ごとの課題。最後の部屋は主）
// 部屋の数が多いダンジョン（T121 は 8 部屋）は順にくり返す。最後の部屋（主）には課題が無い。
// kill: 部屋の敵を（湧く所の数だけ）倒す / switch: 3 つのスイッチを番号の順に踏む（調べる） / carry: 荷物を持って時間内に出口へ / climb: いちばん高い足場の旗に触る
const DUNGEONS = {
  V516: ['kill', 'switch', 'carry', 'climb'],
  T121: ['switch', 'kill', 'climb', 'carry'],
  T122: ['carry', 'switch', 'kill', 'climb'],
  C119: ['climb', 'kill', 'switch', 'carry'],
  M115: ['kill', 'carry', 'switch', 'climb'],
  D117: ['switch', 'climb', 'carry'],
};
const DUNGEON_RULES = { carrySec: 25, chests: 3, mark: 'etc.fun.dungeon_mark', chestItems: ['use.gacha_ticket', 'use.elixir', 'use.exp_coupon', 'use.fun.hair_coupon', 'scroll.A18.60', 'scroll.A17.60'] };
const MARK_PRIZES = [
  { item: 'use.gacha_ticket', cost: 1 }, { item: 'use.power_elixir', cost: 2 }, { item: 'use.drop_coupon', cost: 4 },
  { item: 'scroll.A18.60', cost: 3 }, { item: 'scroll.A24.60', cost: 3 }, { item: 'setup.fun.tag.gold', cost: 8 }, { item: 'setup.fun.outfit.star', cost: 10 },
];

// ---------------------------------------------------------------- 11. 天気（上から最初に合う物。chance は 1 時間ごとに降る確率。中の型（洞くつ・塔・部屋・ボス・船）は降らない）
const WEATHER = {
  indoorThemes: ['cave', 'tower', 'room', 'rooms', 'boss', 'ship', 'dungeon'],
  rules: [
    { match: '^F', kind: 'snow', chance: 1 },
    { match: '^(V50[89]|V510|V620|V306|V307)$', kind: 'fog', chance: 0.7 },
    { match: '^V3', kind: 'petals', chance: 0.4 },
    { match: '^V2', kind: 'petals', chance: 0.2 },
    { match: '^(V|S)', kind: 'rain', chance: 0.2 },
    { match: '^D', kind: 'rain', chance: 0.3 },
  ],
  bgmVolume: { rain: 0.75, snow: 0.9, fog: 0.85, petals: 1 },
};

// ---------------------------------------------------------------- 町の機械・係（spots）
const SPOTS = [
  ...GACHA.map((g) => ({ id: `gacha.${g.town}`, kind: 'gacha', map: g.town, name: g.name })),
  { id: 'arcade.V200', kind: 'arcade', map: 'V200', name: '遊び場の係コマ爺' },
  { id: 'salon.V500', kind: 'salon', map: 'V500', name: '美容院のカミラ' },
  { id: 'boutique.V090', kind: 'boutique', map: 'V090', name: '見た目の品のキラ' },
  { id: 'marks.V090', kind: 'marks', map: 'V090', name: '印の交換所のトオル' },
  { id: 'season.V100', kind: 'season', map: 'V100', name: '祭りの係ミノリ' },
];

const parseStats = (text) => {
  const W = { 攻撃力: 'watk', 魔力: 'matk', 防御: 'wdef', 魔防: 'mdef', 命中: 'acc', 回避: 'avoid', 速さ: 'speed', HP: 'hp', MP: 'mp', STR: 'str', DEX: 'dex', INT: 'int', LUK: 'luk' };
  const o = {};
  for (const m of text.matchAll(/(攻撃力|魔力|防御|魔防|命中|回避|速さ|HP|MP|STR|DEX|INT|LUK)\+(\d+)/g)) o[W[m[1]]] = (o[W[m[1]]] || 0) + +m[2];
  return o;
};

/** items.json に足す品（export_data.mjs の addItem に渡す形）。 */
export function funItems(MONSTERS_RAW) {
  const out = [];
  for (const [id, name, tab, extra = {}] of FUN_ITEMS) out.push({ id, name, tab, maxStack: tab === 'setup' ? 1 : 100, price: 0, ...extra });
  for (const [id, name, slot, lv, stats, desc] of FUN_EQUIPS) {
    out.push({ id, name, tab: 'equip', maxStack: 1, slot, job: 'common', reqLevel: lv, stats: parseStats(stats), upgrades: 7, price: 0, sellPrice: Math.max(1, lv * 20), desc });
  }
  return out;
}

// 地面の空いている所（ほかの NPC・ポータル・置いた物から 70 px 以上、地面の平らな所）
function placeSpot(map, used) {
  const ground = (map.footholds || []).filter((f) => f.ground);
  const busy = [...(map.npcs || []).map((n) => n.x), ...(map.portals || []).map((p) => p.x), ...(map.objects || []).map((o) => o.x), ...used];
  const mid = map.width / 2;
  for (let k = 0; k < map.width; k += 16) {
    for (const x of [mid + k, mid - k]) {
      if (x < 120 || x > map.width - 120) continue;
      if (busy.some((b) => Math.abs(b - x) < 70)) continue;
      for (const f of ground) {
        const pts = f.points;
        for (let i = 0; i + 1 < pts.length; i++) {
          const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
          if (x >= x1 + 20 && x <= x2 - 20 && y1 === y2) return { x: Math.round(x), y: y1 };
        }
      }
    }
  }
  return null;
}

/** fun.json の中身。world = buildWorld の結果、items = 書き出す品の一覧（ID の確かめ用）。 */
export function buildFun({ world, items, MONSTERS_RAW, problems }) {
  const has = (id) => items.some((i) => i.id === id);
  const need = (id, where) => { if (id.startsWith('card.')) { mob(id.slice(5), where); return; } if (!has(id)) problems.push(`楽しさの要素 ${where}: アイテム ${id} が無い`); };
  const mob = (id, where) => { if (!MONSTERS_RAW.some((r) => r[0] === id)) problems.push(`楽しさの要素 ${where}: 敵 ${id} が無い`); };
  const spots = [];
  const usedBy = {};
  for (const s of SPOTS) {
    const m = world.maps[s.map];
    if (!m) { problems.push(`楽しさの要素: マップ ${s.map} が無い`); continue; }
    const used = usedBy[s.map] ||= [];
    const p = placeSpot(m, used);
    if (!p) { problems.push(`楽しさの要素: ${s.id} を置く所が ${s.map} に無い`); continue; }
    used.push(p.x);
    spots.push({ ...s, x: p.x, y: p.y });
  }
  for (const g of GACHA) for (const p of g.prizes) need(p.item, `景品の機械 ${g.town}`);
  const fieldBosses = FIELD_BOSSES.map(([m, map, min, max]) => {
    mob(m, 'フィールドボス');
    if (!world.maps[map]) problems.push(`フィールドボス ${m}: マップ ${map} が無い`);
    const drops = [{ item: `eq.fun.boss.${m}`, chance: 0.3 }, { item: 'use.gacha_ticket', chance: 0.6, count: 2 }];
    const extra = { M420: 'setup.fun.hat.stump', M423: 'setup.fun.hat.sheep', M426: 'setup.fun.chair.nest', M421: 'setup.fun.chair.mushroom', M422: 'setup.fun.bubble.leaf', M424: 'setup.fun.chair.ice', M425: 'setup.fun.chair.shell', M427: 'setup.fun.hat.star' }[m];
    if (extra) drops.push({ item: extra, chance: 0.15 });
    for (const d of drops) need(d.item, `フィールドボス ${m}`);
    return { mob: m, map, minSec: min * 60, maxSec: max * 60, warnSec: 60, drops };
  });
  for (const v of VOYAGES) for (const r of v.raids) for (const m of r.mobs) mob(m, `船の旅 ${v.npc}`);
  for (const p of ARCADE.prizes) need(p.item, '遊び場の景品');
  for (const s of SEASONS) { mob(s.mob, `季節 ${s.id}`); need(s.task.item, `季節 ${s.id}`); for (const r of [...s.task.first, ...s.task.again]) need(r.item, `季節 ${s.id}`); }
  for (const [id] of BOUTIQUE) need(id, '見た目の品の店');
  for (const id of DUNGEON_RULES.chestItems) need(id, 'ダンジョンの宝箱');
  for (const p of MARK_PRIZES) need(p.item, '印の交換');
  for (const map of Object.keys(DUNGEONS)) if (!world.maps[map]) problems.push(`ダンジョン ${map} が無い`);
  const seasonMobs = Object.fromEntries(SEASON_MOBS.map(([m, season, maps]) => [season, maps]));
  return {
    note: 'Data/tools/fun.mjs から書き出した（景品の機械・フィールドボス・船の旅・感情表現・遊び場・季節・美容院・珍しい敵・ダンジョンの課題・見た目の品・天気）。手で直さない。',
    spots,
    looks: Object.fromEntries(FUN_ITEMS.filter(([, , , e]) => e?.fun).map(([id, , , e]) => [id, e.fun])),
    gacha: { ticket: 'use.gacha_ticket', ticketPrice: 1500, mobTicketChance: 0.002, machines: GACHA.map((g) => ({ id: `gacha.${g.town}`, town: g.town, name: g.name, prizes: g.prizes })) },
    fieldBosses,
    voyages: VOYAGES,
    emotes: EMOTES, emoteSec: 4,
    arcade: ARCADE,
    seasons: SEASONS.map((s) => ({ ...s, maps: seasonMobs[s.id] || [] })),
    salon: SALON,
    boutique: BOUTIQUE.map(([item, price]) => ({ item, price })),
    rare: RARE,
    dungeons: { rooms: DUNGEONS, ...DUNGEON_RULES, prizes: MARK_PRIZES },
    weather: WEATHER,
  };
}
