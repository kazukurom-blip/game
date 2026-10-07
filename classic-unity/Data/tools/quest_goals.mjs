// 大陸から先のクエストのうち、目的が文章だけの物（「手紙を届ける」「調べる」「ダンジョンをクリア」など）を、
// Core の QuestLog で判定できる目的に書き直した表。あらすじと文章は quests.mjs のまま（goalText に残る）。
// 目的の種類: talk（NPC と話す）/ visit（マップに着く）/ interact（調べる物。マップの objects）/ collect（持ち物の数。完了で渡す）
//             kill（倒す）/ event（Core が知らせる操作の名前。下の EVENTS）
// end: 報告先（無ければ依頼者）。minStats: 受ける条件の能力値（転職: STR35 など）。parsed: true なら [[..]] から読んだ目的を前に付ける。
//
// Core が知らせる event の名前（GameSession.QuestEvent）:
//   quickslot_set / use_potion / ap_spent / sp_spent / skill_used（チュートリアル）
//   job_advance.1（1 次転職した時）/ job_advance.2 / job_advance.3 / job_advance.4（2〜4 次。転職の試験の仕組みができたら呼ぶ）
//   storage_deposit / storage_withdraw（倉庫。仕組みはまだ）
//   pet_adopted / pet_fed / pet_closeness（ペット。仕組みはまだ）
//   dungeon_clear（どれかの 1 人用ダンジョン）と dungeon_clear.<マップID>（そのダンジョン）（仕組みはまだ）
//   boss_kill（ボス・大ボスを倒した時）
//   quiz_cleared（賢者の石のクイズ。仕組みはまだ）
const talk = (npc, label) => ({ type: 'talk', npc, ...(label ? { label } : {}) });
const visit = (map, label) => ({ type: 'visit', map, ...(label ? { label } : {}) });
const look = (target, label, count) => ({ type: 'interact', target, label, ...(count ? { count } : {}) });
const give = (item, count, label) => ({ type: 'collect', item, count, ...(label ? { label } : {}) });
const ev = (event, label, count) => ({ type: 'event', event, label, ...(count ? { count } : {}) });

const LETTER = (npc, who) => ({ objectives: [talk(npc, `${who}に手紙を届ける`)], end: npc });

export const QUEST_GOALS = {
  // ===== ブリーズ港 =====
  'V-01': { objectives: [give('special.letter_breeze', 1, '推薦状を見せる')] },
  'V-02': LETTER('erna', '弓の師範エルナ'),
  'V-03': LETTER('orfe', '大魔導師オルフェ'),
  'V-04': LETTER('dorga', '戦士長ドルガ'),
  'V-05': LETTER('yami', '影の頭領ヤミ'),
  'V-06': { objectives: [talk('rio', 'キャプテン・リオに手紙を届ける')], end: 'olga' },
  'V-07': { parsed: true, objectives: [look('V102.lamp', '灯台のてっぺんのランプを掃除する')], end: 'sol' },
  'V-10': { objectives: [look('V105.pool', '行き止まりの水たまりを調べる')] },
  'V-13': { objectives: [ev('storage_deposit', '倉庫に 1 つ預ける'), ev('storage_withdraw', '倉庫から取り出す')] },
  // ===== ポム丘 =====
  'B-10': { objectives: [look('V202.bellpig', '鈴の音のするブタっぺを連れ戻す', 3)] },
  'B-12': { objectives: [look('V202.flag', '風車のてっぺんの旗に触る')] },
  'B-14': { objectives: [look('V212.telescope', '見張り小屋の望遠鏡をのぞく')] },
  'PET-01': { objectives: [ev('pet_adopted', 'ペットを迎える')] },
  'PET-02': { objectives: [ev('pet_fed', 'ペットに餌をあげる', 3)] },
  'PET-03': { parsed: true, objectives: [] },
  'PET-04': { objectives: [ev('pet_closeness', 'ペットの親密度を 10 にする', 10)] },
  'PET-05': { objectives: [ev('pet_closeness', 'ペットの親密度を 15 にする', 15)] },
  'PET-06': { objectives: [ev('pet_closeness', 'ペットの親密度を 20 にする', 20)] },
  'PET-07': { objectives: [ev('pet_closeness', 'ペットの親密度を 25 にする', 25)] },
  // ===== シルワ森都 =====
  'W-01': { objectives: [look('V301.book', '森の入口の光る本'), look('V302.book', 'スライムの池の光る本'), look('V303.book', 'ヒトツメの森の光る本')] },
  'W-05': { parsed: true, objectives: [talk('herb', '薬草屋ハーブに薬を作ってもらう')] },
  'W-06': { objectives: [look('V305.stump', '一番奥の切り株に印を付ける')] },
  'W-11': { objectives: [visit('C100', '雲の船でセレスへ'), talk('stella', '都の巫女ステラに会う')], end: 'stella' },
  // ===== ガルド岩台 =====
  'G-09': { objectives: [look('V409.fossil1', '化石（大きな骨）'), look('V409.fossil2', '化石（貝）'), look('V409.fossil3', '化石（羽）')] },
  'G-14': { objectives: [give('etc.ore.bronze', 10, '青銅の原石を 10 個')] },
  // ===== クロウ街 =====
  'K-03': { objectives: [look('V504.toolbox', 'てっぺんの道具箱を取ってくる')] },
  'K-08': { objectives: [look('V506.lost', '停まった電車の中の落とし物')] },
  'K-13': { objectives: [visit('V514', '屋上を渡る'), talk('kago', '荷物番のカゴに包みを届ける')], end: 'kago' },
  'K-14': { objectives: [ev('dungeon_clear.V516', '裏路地の試練をクリアする')] },
  // ===== ねむり谷 =====
  'N-05': { objectives: [look('V601.diary', '大木のうろの研究所の日記')] },
  // ===== 地域ごとの最初の顔合わせ =====
  'C-01': { objectives: [talk('luna', '駅員ルナ'), talk('nefe', '受付ネフェ'), talk('hashi', '天の階段の船頭')] },
  'C-06': { objectives: [visit('C111', '雲の塔を 1 階まで降りる'), talk('van', '村長ヴァンに手紙を届ける')], end: 'van' },
  'T-01': { objectives: [talk('clock', '時計番のクロック婆'), talk('gear', '受付ギア'), talk('paz', '受付パズ')] },
  'M-01': { objectives: [talk('norma', '潜水船の船長ノーマ'), talk('shell', '受付シェル')] },
  'M-09': { objectives: [look('M107.chest', '大きな骨の口の中の宝箱を開ける')] },
  'D-01': { objectives: [talk('hawk', '鳥使いホーク'), talk('doran', '鍛冶屋ドラン'), talk('vald', '竜の大老ヴァルド')] },
  'D-08': { parsed: true, objectives: [look('D113.seal', '封印の石に素材をはめる')] },
  'H-02': { objectives: [look('H106.stele', '迷路とジャンプの道の奥の石碑に触る')] },
  'E-01': { objectives: [visit('E100', '大きな鳥で星見の塔へ'), talk('astra', '塔の主アストラに会う')], end: 'astra' },
  // ===== 本筋（星の夢） =====
  'L-01': { objectives: [look('S008.stele', '島の高台の古い石碑を調べる')] },
  'L-02': { objectives: [visit('V090'), talk('yomi', '占い師ヨミの露店を訪ねる')] },
  'L-03': { objectives: [talk('libra', '黒いかけらを司書リブラに見せる')], end: 'libra' },
  'L-05': { objectives: [talk('stella', '黒い角を都の巫女ステラに見せる')], end: 'stella' },
  'L-06': { objectives: [talk('van', 'ヒョウガ村の村長ヴァン'), talk('clock', 'ティンクルの時計番'), talk('ruri', 'マリナの侍女ルリ')] },
  'L-07': { objectives: [look('T115.clock', '時の塔の古い時計を調べる')] },
  'L-10': { objectives: [give('etc.M229', 1, '巨像の目'), talk('alma', '神殿の巫女アルマに届ける')], end: 'alma' },
  'L-11': { objectives: [talk('ruri', 'マリナで海の底の歌を聞く')] },
  'L-12': { objectives: [talk('hawk', '鳥使いホークに頼む')] },
  // ===== 繰り返し・1 人用ダンジョン =====
  'R-21': { objectives: [ev('boss_kill', '地域のボスを 1 体倒す')] },
  'R-22': { objectives: [ev('dungeon_clear', '1 人用ダンジョンをどれか 1 回クリアする')] },
  'PQ-1': { objectives: [ev('dungeon_clear.V516', '裏路地の試練をクリアする')] },
  'PQ-2': { objectives: [ev('dungeon_clear.T121', 'からくり迷宮をクリアする')] },
  'PQ-3': { objectives: [ev('dungeon_clear.T122', 'おもちゃ箱の迷路の出口まで')] },
  'PQ-4': { objectives: [ev('dungeon_clear.C119', '雲の女神の塔の最上階まで')] },
  'PQ-5': { objectives: [ev('dungeon_clear.M115', '沈没船の救出をクリアする')] },
  'PQ-6': { objectives: [ev('dungeon_clear.D117', '竜の巣の卵をクリアする')] },
};

// ===== 転職（5 系統 × 9 段。QUESTS.md 6 章） =====
const LINES = [
  // [系統, 転職官, 長老, 能力値の条件]
  ['J1', 'dorga', 'glen', { STR: 35 }],
  ['J2', 'orfe', 'frost', { INT: 20 }],
  ['J3', 'erna', 'heine', { DEX: 25 }],
  ['J4', 'yami', 'mist', { DEX: 25 }],
  ['J5', 'rio', 'keel', { DEX: 20 }],
];
for (const [j, master, elder, stat] of LINES) {
  QUEST_GOALS[`${j}-1`] = { minStats: stat, objectives: [ev('job_advance.1', '1 次の職になる')] };
  QUEST_GOALS[`${j}-2`] = { objectives: [talk(master, '推薦状を受け取る')] };
  QUEST_GOALS[`${j}-4`] = { objectives: [ev('job_advance.2', '試験の証を渡し、2 次の職を選ぶ')], end: master };
  QUEST_GOALS[`${j}-5`] = { objectives: [talk(master, '長老の手紙を届ける')], end: master };
  QUEST_GOALS[`${j}-7`] = { objectives: [give('etc.M300', 1, '黒いお守りを捧げる'), look('F107.sage_stone', '賢者の石に捧げる'), ev('quiz_cleared', '5 問のクイズに答える')] };
  QUEST_GOALS[`${j}-8`] = { objectives: [talk('vald', '竜の大老ヴァルドに推薦状を届ける')], end: 'vald' };
  QUEST_GOALS[`${j}-9`] = { parsed: true, objectives: [give('etc.M211', 1, '紅の印を渡す'), give('etc.M212', 1, '蒼の印を渡す')] };
  void elder;
}
