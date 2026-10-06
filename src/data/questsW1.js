// v4（クエスト担当）: 第1ワールドの連作クエスト（q_<名前>_<番号>）と、第2ワールドへ行くメインの連作（m2_...）
//  missions.js の「v4 クエスト」区画が読み込んで MISSIONS に足す。docs/QUESTS.md に一覧、docs/SPEC_V4.md に書き方。
//  連作のしくみ:
//   - 各話は前の話を prereq に持つ（自動）。最後の話の報酬に専用装備 qset_* が付く。
//   - 派生（A 編・B 編）: 途中の話の choices（報告時に選ぶ）で分かれる。続きは reqChoice:{mission, choice} で片方だけ受けられる。
//     分かれたあと合流する話・地域の記念クエストは prereqAny: [[A の最後, B の最後]] でどちらかを終えていれば良い。
//   - 前の話の結果でセリフが変わる: choices の flag（qc_<連作>_<選択>）を dialogByFlag で読む。
//   - ネタの連作（kind:'joke'）は、見た目だけのネタ装備（cosmetic）を毎話くれる。
//  報酬: exp = expToNext(reqLevel+2) × 係数（普通の話 0.3 / 最後の話 0.45 / ネタ 0.25 / 地域の記念 0.5。expFixed）、
//        お金 = 10 × Lv² × 倍率（今のサブクエストと同じくらい）、ポーションはレベル帯に合わせて自動。
import { expToNext } from './balance.js';
import { ITEMS } from './items.js';
import { ENEMIES } from './enemies.js';

// ---- 目的の書き方（missions.js の objectives と同じ）
const K = (target, count, mapId, text) => ({ type: 'kill', target, count, mapId, text });
const B = (target, mapId, text) => ({ type: 'boss', target, count: 1, mapId, text });
const C = (target, count, mapId, text) => ({ type: 'collect', target, count, ...(mapId ? { mapId } : {}), text });
const R = (target, text) => ({ type: 'reach', target, count: 1, text });
const T = (target, mapId, text) => ({ type: 'talk', target, count: 1, mapId, text });

/** 新しい NPC と、今いて依頼をするようになる NPC（MISSION_NPCS に足す。見た目と置き場所は questNpcs.js / maps.js） */
export const QUEST_NPCS = {
  // beach
  mel:         { name: 'メル', mapId: 'beach', role: '砂の城職人の少女。毎晩城を壊されて困っている。' },
  old_gus:     { name: 'ガスじいさん', mapId: 'beach', role: 'ピア桟橋の灯台守。亡き妻の灯りを守り続けている。' },
  popo:        { name: 'ポップコーン屋ポポ', mapId: 'beach', role: '[ネタ] カモメに売り物を全部取られる発明好きの屋台主。' },
  kiki:        { name: 'キキ', mapId: 'beach', role: '迷子のペット「ポチ」を探す観光客。' },
  lyra:        { name: '語り部リラ', mapId: 'beach', role: '[地域をまたぐ連作] 街の伝説「ネオン・フェニックス」を追う吟遊詩人。' },
  // downtown
  pierre:      { name: 'ピエール', mapId: 'downtown', role: '[ネタ] 一言もしゃべらないパントマイマー。' },
  mika:        { name: '記者ミカ', mapId: 'downtown', role: 'ヴァイス・ベイ新報の記者。「地下鉄の怪物」を追う。' },
  granny_ume:  { name: 'ウメばあちゃん', mapId: 'slums', role: '港の長屋に住むおばあちゃん。亡き夫のレシピ帳を探す。実はママ・ローザの母。' },
  tony:        { name: 'スケーターのトニー', mapId: 'beach', role: 'ボードウォークのスケーター。ダウンタウンのセントラル公園のスケボー場を守りたい。' },
  dash_garage: { name: 'ダッシュ', mapId: 'downtown', role: 'ガレージの主。副業でネオン看板も直している。' },
  shop_downtown: { name: 'ミミ', mapId: 'downtown', role: 'ネオン・ブティックの店員。…その正体は？' },
  // slums
  old_mori:    { name: 'モリ船長', mapId: 'slums', role: '陸に上がった元船長。幽霊船の噂を追う。' },
  rina:        { name: 'リナ', mapId: 'slums', role: 'タンクの弟子。自分だけの相棒ロボを作りたい。' },
  dan_sweeper: { name: '清掃員ダン', mapId: 'slums', role: '港の清掃員（三十年）。黒い排水の出どころを探る。' },
  bubbles:     { name: 'シャボンおじさん', mapId: 'slums', role: '[ネタ] 港を包む巨大シャボン玉を作りたいおじさん。' },
  barney:      { name: 'レコード屋バーニー', mapId: 'slums', role: '[地域をまたぐ連作] 幻のレコード「ヴァイス・ナイト」を追う中古盤屋。' },
  sal_pawn:    { name: 'サル', mapId: 'slums', role: '港の質屋。盗品の行方を知っている。' },
  // swamp
  sue:         { name: 'レンジャーのスー', mapId: 'swamp', role: 'グレイズ自然保護区のレンジャー。密猟者を追う。' },
  geko:        { name: 'ゲコ様', mapId: 'swamp', role: '[ネタ] 自称・呪いで人間のおじさんにされたカエルの王子。' },
  tad:         { name: '少年タッド', mapId: 'swamp', role: '伝説の白いワニを見たい村の少年。' },
  voodoo_betty: { name: 'ブードゥー・ベティ', mapId: 'swamp', role: '沼の魔女の薬屋。霧の鬼火の正体を知っている。' },
  // casino
  lou:         { name: 'ラッキー・ルー', mapId: 'casino', role: '一度も勝ったことがないギャンブラー。父の亡霊を追う。' },
  coco:        { name: 'ショーガールのココ', mapId: 'casino', role: 'ネオン・パレスの踊り子。盗まれた衣装を探す。' },
  ken_valet:   { name: '駐車係ケン', mapId: 'casino', role: 'ロボに仕事を奪われた元バレー。' },
  king_bob:    { name: '「キング」ボブ', mapId: 'casino', role: '[ネタ] ものまね芸人。正体はコンビニの店長。' },
  hound:       { name: '探偵ハウンド', mapId: 'casino', role: '[地域をまたぐ連作] ネオン怪盗団を追う私立探偵。' },
  mr_chip:     { name: 'ミスター・チップ', mapId: 'casino', role: '景品交換所の主。景品の在庫が消えて困っている。' },
  // rooftop
  jo_window:   { name: '窓拭きのジョー', mapId: 'rooftop', role: '地上300mの窓拭き職人。勝手に動く足場に悩む。' },
  ivy:         { name: '庭師アイビー', mapId: 'rooftop', role: '空中庭園の庭師。枯れていく木を救いたい。' },
  rook:        { name: '元傭兵ルーク', mapId: 'rooftop', role: 'ビルの管理人。ドン親衛隊に残る弟を連れ戻したい。' },
  yui:         { name: 'ユイ', mapId: 'rooftop', role: '[ネタ] フォロワー3人の自撮りインフルエンサー。' },
  // spaceport
  pip:         { name: '訓練生ピップ', mapId: 'spaceport', role: 'パイロット訓練生。試験に三回落ちている。' },
  chef_orbit:  { name: 'シェフ・オービット', mapId: 'spaceport', role: '「うまい宇宙食」を作りたい宇宙食シェフ。' },
  tanaka:      { name: 'ギャラクシー田中', mapId: 'spaceport', role: '[ネタ] UFOを呼ぶ男。' },
  gate_vega:   { name: 'ゲート技師ベガ', mapId: 'spaceport', role: '[第2部] 次元ゲートを研究する技師。m2 の連作の中心人物。' },
};

/** 連作の称号（achievements.js の EXTRA_TITLES に足す。flag が立てば所持） */
export const QUEST_TITLES = {
  t_memento_beach: { name: 'ビーチの人気者', source: 'クエスト（ビーチの連作をすべて）', flag: 'title_memento_beach' },
  t_memento_downtown: { name: 'ダウンタウンの顔', source: 'クエスト（ダウンタウンの連作をすべて）', flag: 'title_memento_downtown' },
  t_memento_slums: { name: '港の頼れる奴', source: 'クエスト（ポート・スラムの連作をすべて）', flag: 'title_memento_slums' },
  t_memento_swamp: { name: 'グレイズの守り人', source: 'クエスト（グレイズ村の連作をすべて）', flag: 'title_memento_swamp' },
  t_memento_casino: { name: 'ストリップの常連', source: 'クエスト（ゴールデン・ストリップの連作をすべて）', flag: 'title_memento_casino' },
  t_memento_rooftop: { name: '摩天楼の住人', source: 'クエスト（ヴァイス・タワーの連作をすべて）', flag: 'title_memento_rooftop' },
  t_memento_spaceport: { name: 'ルミナの名誉職員', source: 'クエスト（ルミナ宇宙港の連作をすべて）', flag: 'title_memento_spaceport' },
  t_phoenix: { name: '不死鳥の語り部', source: 'クエスト（街の伝説）', flag: 'title_phoenix' },
  t_phantom: { name: '怪盗の共犯者', source: 'クエスト（ネオン怪盗団・見逃した）', flag: 'title_phantom_free' },
  t_hound: { name: '名探偵の相棒', source: 'クエスト（ネオン怪盗団・捕まえた）', flag: 'title_phantom_arrest' },
  t_gate_opener: { name: '次元の扉を開く者', source: 'メインストーリー第2部 序章', flag: 'title_gate_opener' },
};

// ---- 報酬の計算
const money = (lv, mul = 1) => Math.max(100, Math.round((10 * lv * lv * mul) / 10) * 10);
function pots(lv) {
  if (lv < 10) return ['potion_red', 'potion_red', 'potion_red', 'potion_blue'];
  if (lv < 20) return ['potion_orange', 'potion_orange', 'potion_blue', 'potion_blue'];
  if (lv < 36) return ['potion_orange', 'potion_orange', 'potion_orange', 'potion_blue', 'potion_blue'];
  if (lv < 60) return ['potion_white', 'potion_white', 'potion_mana'];
  if (lv < 90) return ['potion_white', 'potion_white', 'potion_white', 'potion_mana', 'power_elixir'];
  return ['power_elixir', 'power_elixir', 'elixir'];
}
const expOf = (lv, f) => Math.round(expToNext(lv + 2) * f);

// ---- 会話の窓の強調（SPEC_V4「本文の強調の書き方」）: セリフ・問いの中の人名=#d 紫、地名=#g 緑、アイテム=#b 青、敵=#r 赤
//  データには平文で書き、ここで自動で印を付ける（desc・選択肢の文は J の窓や通知にも出るので平文のまま）。
const HL_NPC = ['リコ', 'サニー', 'ママ・ローザ', 'ローザ', 'カイ巡査', 'DJパルス', 'パルス', 'タンク', 'ブーンじいさん', 'ブーンさん', 'ヴィヴィ', 'ノヴァ', 'ステラ博士', 'エース・ジェット', 'エース教官',
  'ゴースト・リリィ', 'クロック・ジョー', 'クイーン・ダイヤ', 'ダイヤさん', 'ミスター・チップ', 'ブードゥー・ベティ', 'ベティ', 'サルさん', 'ハーケン', 'ジュエル', 'ドン・カイマン',
  'メル', 'ガスじいさん', 'ガスさん', 'ポポ', 'キキ', 'ポチ', '語り部リラ', 'リラ', 'ピエール', '記者ミカ', 'ミカ', 'ウメばあちゃん', 'ウメ', 'トニー', 'ダッシュ', 'ミミ', 'モリ船長', 'リナ', 'ボルト',
  '清掃員ダン', 'シャボンおじさん', 'レコード屋バーニー', 'バーニー', 'DJノイズ', 'レンジャーのスー', 'ゲコ様', '少年タッド', 'タッド', 'ラッキー・ルー', 'ココ', 'ケン', '「キング」ボブ', 'ボブ',
  '探偵ハウンド', 'ハウンド', '窓拭きのジョー', 'ジョー', 'アイビー', 'ルーク', 'ジェイ', 'ユイ', 'ピップ', 'オービット', 'ギャラクシー田中', '田中', 'ゲート技師ベガ', 'ベガ', 'ゾグ'];
const HL_MAP = ['ヴァイス・ビーチ', 'サンセット海岸道', 'ヤシの並木道', 'ピア桟橋', 'ハイウェイ入口', 'ダウンタウン', 'ネオン裏通り', '裏通り', '地下鉄トンネル', '高架ハイウェイ', 'セントラル公園',
  'ポート・スラム', 'グレイズ', '倉庫街', '造船所', '密輸船', '廃線路', 'グレイズ村', '湿地の入口', 'マングローブ迷路', 'ワニの巣', '霧の水路', 'ゴールデン・ストリップ', 'カジノ街', '砂漠ハイウェイ', '地下金庫',
  'VIPフロア', '夜景ブールバード', 'ネオン・パレス', 'ヴァイス・タワー', '工事現場の足場', '空中庭園', '最上階ペントハウス', 'ペントハウス', 'ルミナ宇宙港', '沿岸ロケット道', '発射台エリア',
  '月面シミュ区画', '月面区画', '謎の宇宙船', 'ネオン・アーク', 'ヴァイス・ベイ'];
const HL_ITEM = Object.values(ITEMS).filter((it) => it.type === 'etc' && it.name.length >= 3).map((it) => it.name).concat(['月の石', 'ネオン管', '海図', 'ヴァイス・ナイト']);
const HL_ENEMY = Object.values(ENEMIES).filter((e) => !e.civilian && !e.isCop && e.name.length >= 3).map((e) => e.name);
const HL = new Map();
for (const [list, c] of [[HL_ENEMY, 'r'], [HL_ITEM, 'b'], [HL_MAP, 'g'], [HL_NPC, 'd']]) for (const w of list) HL.set(w, c);
const HL_RE = new RegExp([...HL.keys()].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
/** hl(文) → 強調の印つきの文（すでに # を含む文はそのまま） */
export function hl(line) {
  if (typeof line !== 'string' || line.includes('#')) return line;
  // 短いカタカナの名前が、長いカタカナの言葉の一部（「コリコリ」の「リコ」など）のときは付けない
  const kata = (ch) => !!ch && /[ァ-ヴー]/.test(ch);
  return line.replace(HL_RE, (w, at) => (w.length <= 3 && (kata(line[at - 1]) || kata(line[at + w.length])) ? w : `#${HL.get(w)}${w}#k`));
}
const hlLines = (a) => (Array.isArray(a) ? a.map(hl) : a);
function hlMission(m) {
  if (m.dialog) m.dialog = { ...m.dialog, offer: hlLines(m.dialog.offer), done: hlLines(m.dialog.done) };
  for (const d of Object.values(m.dialogByFlag || {})) { if (d.offer) d.offer = hlLines(d.offer); if (d.done) d.done = hlLines(d.done); }
  if (m.choicePrompt) m.choicePrompt = hl(m.choicePrompt);
  for (const c of m.choices || []) if (c.dialog) c.dialog = hlLines(c.dialog);
  return m;
}

/** 連作の一覧: key → {key, name, region, npc, kind, qset, ids, lastIds} */
export const QUEST_SERIES = {};
const out = [];

/**
 * series(key, meta, eps)
 *  meta: {name, region, npc, kind:'story'|'joke'|'cross', qset?, prereq?, flags?（最後の話で立てる）}
 *  ep:   {n, t（題名）, lv, o（目的）, offer, done, d?（説明）, giver?, turnIn?, items?, mul?,
 *         pre?（前提の話の番号。省略時は1つ前）, branch?:'a'|'b', from?（分かれた話の番号）, last?,
 *         choice?:{prompt, a:{text, dialog, flags?}, b:{...}}, dbf?（dialogByFlag）, preAny?（番号の配列）, flags?}
 */
function series(key, meta, eps) {
  const S = (QUEST_SERIES[key] = { key, name: meta.name, region: meta.region, npc: meta.npc, kind: meta.kind || 'story', qset: meta.qset || null, ids: [], lastIds: [] });
  const id = (n) => `q_${key}_${n}`;
  const hasBranch = eps.some((e) => e.branch);
  eps.forEach((e, i) => {
    const last = e.last ?? (!hasBranch && i === eps.length - 1);
    const joke = S.kind === 'joke';
    const n = String(e.n);
    const label = /^\d+$/.test(n) ? `第${n}話` : `第${n.slice(0, -1)}話${n.slice(-1).toUpperCase()}`;
    let prereq;
    if (e.pre != null) prereq = [].concat(e.pre).map(id);
    else if (i === 0) prereq = [...(meta.prereq || [])];
    else prereq = [id(eps[i - 1].n)];
    const items = [...(e.items || []), ...(joke ? pots(e.lv).slice(0, 2) : pots(e.lv))];
    if (last && S.qset) items.unshift(S.qset);
    const f = joke ? 0.25 : last ? 0.45 : 0.3;
    const m = {
      id: id(n), name: `【${meta.name}】${label} ${e.t}`, category: 'sub', giver: e.giver || meta.npc, ...(e.turnIn ? { turnIn: e.turnIn } : {}),
      reqLevel: e.lv, prereq, desc: e.d || e.offer[e.offer.length - 1],
      dialog: { offer: e.offer, done: e.done }, objectives: e.o,
      reward: { exp: expOf(e.lv, S.kind === 'cross' ? f * 1.1 : f), expFixed: true, money: money(e.lv, e.mul ?? (last ? 1.6 : 1)), items,
        ...(last && meta.flags ? { flags: [...meta.flags] } : {}), ...(e.flags ? { flags: [...(last && meta.flags ? meta.flags : []), ...e.flags] } : {}) },
      series: key, seriesName: meta.name, episode: n, region: meta.region, questKind: S.kind, ...(last ? { seriesLast: true } : {}),
    };
    if (e.branch) m.reqChoice = { mission: id(e.from), choice: e.branch };
    if (e.preAny) m.prereqAny = [e.preAny.map(id)];
    if (e.dbf) m.dialogByFlag = e.dbf;
    if (e.choice) {
      m.choicePrompt = e.choice.prompt;
      m.choices = ['a', 'b'].map((c) => ({ id: c, text: e.choice[c].text, flag: `qc_${key}_${e.choice[c].tag || c}`, dialog: e.choice[c].dialog,
        ...(e.choice[c].flags ? { flags: e.choice[c].flags } : {}), ...(e.choice[c].reward ? { reward: e.choice[c].reward } : {}) }));
    }
    out.push(m);
    S.ids.push(m.id);
    if (last) S.lastIds.push(m.id);
  });
}

// ============================================================ beach ヴァイス・ビーチ（Lv1〜12）
series('lostdog', { name: 'ポチを探して', region: 'beach', npc: 'kiki', qset: 'qset_kiki_tag' }, [
  { n: 1, t: 'ポチがいない！', lv: 1,
    offer: ['うわーん！ ポチがいなくなっちゃったの！', 'ソーダみたいな、いい匂いがする子なの。サンセット海岸道の方に行ったかも…！'],
    o: [K('slime_green', 8, 'beach_f1', 'サンセット海岸道でソーダの匂いの相手（ソーダスライム）を調べる')],
    done: ['スライム…？ ポチの匂いとそっくりだわ。…まさか、ね。'] },
  { n: 2, t: '目撃者を探せ', lv: 2,
    offer: ['ビーチの情報屋さんなら何か知ってるかも！', 'それとポチの好物も集めておかなきゃ。ぷるぷるのゼリーが大好きなの。'],
    o: [T('rico', 'beach', 'リコに目撃情報を聞く'), C('slime_jelly', 5, 'beach_f1', 'ポチの好物（スライムゼリー）を集める')],
    done: ['リコさんが言ってたの。「ピンクのぷるぷるを連れた子なら、並木道で見たぜ」って。', '…ピンク？ ポチは緑のはずなのに。'] },
  { n: 3, t: 'ポチの正体', lv: 4,
    offer: ['ヤシの並木道で、ぷるぷるの群れが跳ねてるって！ ポチはあの中にいるはず！'],
    o: [K('slime_pink', 10, 'beach_f2', 'ヤシの並木道でストロベリースライムの群れをかき分ける')],
    done: ['ポチ！！ …えっ、ポチってスライムだったの！？ ずっと犬だと思って育ててた…。', 'ピンクの子たちと友だちになってたのね。でもいいの、ぷるぷるでもポチはポチだもん！', 'これ、ポチとおそろいの迷子札。あなたにもあげる！'] },
]);

series('sandcastle', { name: '砂の城の夜', region: 'beach', npc: 'mel', qset: 'qset_sandcastle_cap' }, [
  { n: 1, t: '崩れる城', lv: 3,
    offer: ['あたしメル！ 砂の城職人よ。…なのに毎晩、城が崩されるの！', '海岸道のカニたちが怪しいわ。ちょっと見張ってきて！'],
    o: [K('crab_sand', 10, 'beach_f1', 'サンセット海岸道でサンドクラブを見張る（倒す）')],
    done: ['カニたちはシロみたい。ハサミの跡じゃなかったもの。', 'でも、城のまわりに大きな足跡があったって？'] },
  { n: 2, t: '大きな足跡', lv: 5,
    offer: ['足跡は並木道の方へ続いてるわ。貝殻を背負った何か…。', '証拠を集めてきて！'],
    o: [K('crab_hermit', 6, 'beach_f2', 'ヤシの並木道でヤドカリ番長を調べる（倒す）'), C('crab_shell', 6, 'beach_f2', '証拠のカニの甲羅を集める')],
    done: ['この甲羅…内側に、あたしの城の砂がびっしり！', '犯人はヤドカリ番長ね！'] },
  { n: 3, t: '番長の言い分', lv: 6,
    offer: ['ピア桟橋に番長たちの溜まり場があるんだって。とっちめてやるんだから！'],
    o: [K('crab_hermit', 12, 'beach_f3', 'ピア桟橋のヤドカリ番長たちを追い詰める')],
    done: ['…で、どうするの？'],
    choice: { prompt: '追い詰められたヤドカリ番長たちが、城の欠片を抱えて震えている。…どうやら砂の城を「家」にしたかっただけらしい。どうする？',
      a: { tag: 'peace', text: 'ヤドカリたちと和解して、城を家として作り直す', dialog: ['えっ、あの子たち家が欲しかっただけ…？', 'じゃあ作ってあげましょう！ 名付けて「ヤドカリ団地」よ！'] },
      b: { tag: 'war', text: 'ビーチから追い払う', dialog: ['城を壊すやつは許さない！ 徹底的にやるわよ！'] } } },
  { n: '4a', t: 'ヤドカリ団地', lv: 7, branch: 'a', from: 3, pre: 3, last: true,
    offer: ['セメントの代わりにスライムゼリーを混ぜると、砂がカチカチに固まるの！', '飾りの甲羅もお願い！'],
    o: [C('slime_jelly', 12, 'beach_f1', 'スライムゼリーを集める'), C('crab_shell', 8, 'beach_f2', '飾りのカニの甲羅を集める')],
    done: ['完成〜！ 見て、ヤドカリたちが引っ越してきた！', '番長がお礼に貝殻をくれたわ。あなたの帽子に付けてあげる！'] },
  { n: '4b', t: 'ビーチの番人', lv: 7, branch: 'b', from: 3, pre: 3, last: true,
    offer: ['番長の手下がまだ桟橋にいるわ。それに、桟橋で暴れるフラミンゴもついでにね！'],
    o: [K('crab_hermit', 20, 'beach_f3', 'ピア桟橋のヤドカリ番長を追い払う'), K('flamingo', 8, 'beach_f3', 'ピア桟橋のヤンキーフラミンゴを追い払う')],
    done: ['これで城は安泰ね！ …ちょっとかわいそうだったかな。', 'お礼にこの帽子。城を守った騎士の印よ！'] },
]);

series('lighthouse', { name: '灯台守の夜', region: 'beach', npc: 'old_gus', qset: 'qset_lighthouse_coat' }, [
  { n: 1, t: '消えた灯り', lv: 6,
    offer: ['わしは灯台守のガス。ピア桟橋の先の灯台が、夜になると消えちまうんじゃ。', 'まずは桟橋の様子を見てきてくれんか。'],
    o: [R('beach_f3', 'ピア桟橋へ行く'), K('jellyfish_pier', 10, 'beach_f3', 'ピア桟橋でピアクラゲを追い払う')],
    done: ['クラゲが灯台の下に集まっておったと？ 妙じゃのう…。'] },
  { n: 2, t: '光るクラゲ', lv: 7,
    offer: ['クラゲの触手を調べれば何かわかるかもしれん。持ってきてくれ。'],
    o: [C('jelly_tentacle', 8, 'beach_f3', 'クラゲの触手を集める')],
    done: ['この触手…灯台の燃料と同じ匂いがする。', '何者かが燃料を盗み、クラゲがそれに群がっとるんじゃ。'] },
  { n: 3, t: 'サニーの記憶', lv: 8,
    offer: ['…実はな、昔この灯台にはわしの妻がおった。サニーの婆さんの親友じゃった。', 'サニーに、妻のことを何か聞いておらんか尋ねてくれんか。'],
    o: [T('sunny', 'beach', 'サニーに昔の話を聞く')],
    done: ['…それで、サニーは何と？'],
    choice: { prompt: 'サニーによれば、ガスの妻は「嵐の夜、迷った船のために灯台の燃料を燃やし尽くし、帰らなかった」らしい。ガスはそれを知らない。…伝える？',
      a: { tag: 'truth', text: '本当のことを伝える', dialog: ['…そうか。あいつは最後まで灯台守じゃったか。', 'ありがとう。五十年の胸のつかえが取れたわい。'] },
      b: { tag: 'secret', text: '今は黙っておく', dialog: ['ん？ サニーは何も知らんかったか。…まあ、ええ。', '昔のことじゃ。今は灯りを取り戻すのが先じゃ。'] } } },
  { n: 4, t: '月夜の盗人', lv: 9,
    offer: ['燃料を盗んどるのは、月夜に光るクラゲの群れじゃ。夜の桟橋で待ち伏せてくれ。'],
    dbf: {
      qc_lighthouse_truth: { offer: ['妻が守った灯りじゃ。わしも負けてはおれん。', '燃料を盗むのは、月夜に光るクラゲの群れじゃ。夜の桟橋で待ち伏せてくれ。'] },
      qc_lighthouse_secret: { offer: ['…お前さん、何か言いかけてやめたじゃろう。まあええ。', '燃料を盗むのは、月夜に光るクラゲの群れじゃ。夜の桟橋で待ち伏せてくれ。'] },
    },
    o: [K('jelly_moonlit', 8, 'beach_f3', '夜のピア桟橋でムーンライト・クラゲを倒す（夜だけ出る）'), K('slime_wave', 8, 'beach_f3', 'ビッグウェーブスライムを倒す')],
    done: ['クラゲの腹から燃料が出てきたか！ だが量が足りん。', '…もっと大きいのが、樽ごと飲み込んだんじゃ。'] },
  { n: 5, t: '灯台に灯を', lv: 11,
    offer: ['桟橋の奥のキングゼリー。あやつが燃料の樽を丸呑みしたんじゃ！'],
    o: [B('boss_king_slime', 'beach_f3', 'ピア桟橋でキングゼリーを倒す')],
    done: ['灯台に灯がともった…！ ありがとう。', 'このコートは、わしが海の男だった頃のものじゃ。持っていけ。'],
    dbf: {
      qc_lighthouse_truth: { done: ['灯がともった。…あいつが燃やし尽くした灯りが、また戻ってきた。', 'このコートはあいつが縫ってくれたものじゃ。お前さんに着てほしい。'] },
      qc_lighthouse_secret: { done: ['灯がともった！ …なあ、あの日サニーに何を聞いた？ いや、言わんでええ。灯りが答えじゃ。', 'このコートは、わしが海の男だった頃のものじゃ。持っていけ。'] },
    } },
]);

series('popcorn', { name: 'ポップコーン戦争', region: 'beach', npc: 'popo', kind: 'joke' }, [
  { n: 1, t: 'ポップコーン泥棒', lv: 2, items: ['cos_tourist_aloha'],
    offer: ['へいらっしゃい！ …って言いたいけど、売り物がないんだ！', 'カモメどもがポップコーンを全部持っていくんだよ！', 'カモメと話し合いたいから、まずは羽を…拾ってきて！'],
    o: [K('seagull_beach', 6, 'beach_f2', 'ヤシの並木道でポテト泥棒カモメを追い払う'), C('seagull_feather', 5, 'beach_f2', 'カモメの羽を拾う')],
    done: ['この羽でカモメの気持ちが…わからない！ まあいいや。', 'お礼にこのアロハ。値札は取らないでね、縁起物だから。'] },
  { n: 2, t: 'カモメ語講座', lv: 4, items: ['cos_toilet_slippers'],
    offer: ['考えたんだ。カモメ語を話せばいいって！', 'リコならたぶんカモメ語もいける。…いけないかも。とにかく習ってきて！'],
    o: [T('rico', 'beach', 'リコにカモメ語を習う（？）')],
    done: ['「カァ」は「こんにちは」、「カァカァ」は「ポップコーンよこせ」…リコ、絶対いま考えたよね？', 'お礼はこれ。公衆トイレの前で拾った…じゃなくて、譲ってもらったスリッパ！'] },
  { n: 3, t: '安全第一', lv: 7, items: ['cos_banana_helmet'],
    offer: ['カモメに突かれないヘルメットを発明したよ！ バナナの形で、カモメを油断させるんだ！', '試してきて！'],
    o: [K('seagull_beach', 15, 'beach_f2', 'ヤシの並木道でカモメ相手にヘルメットを試す'), K('flamingo', 6, 'beach_f4', 'ハイウェイ入口のヤンキーフラミンゴにも試す')],
    done: ['どうだった？ …バナナの匂いで余計に寄ってきた？ そっか…。', 'あげる！ 安全第一！'] },
  { n: 4, t: 'カモメの王', lv: 9, items: ['cos_paper_crown'],
    offer: ['ハイウェイ入口に、カモメのボスがいるらしい。ボスに勝てば、きっとポップコーンは守られる！'],
    o: [K('seagull_highway', 12, 'beach_f4', 'ハイウェイ入口でハイウェイカモメに力を見せる')],
    done: ['カモメたちが君に頭を下げてる！ 君が新しいカモメの王だ！', 'はい、王冠。ポップコーンの箱で作ったんだ。…これでうちの店も安泰だね！'] },
]);

// ============================================================ downtown ダウンタウン（Lv10〜22）
series('mime', { name: '沈黙のピエール', region: 'downtown', npc: 'pierre', kind: 'joke' }, [
  { n: 1, t: '見えない壁', lv: 11, items: ['cos_groucho_glasses'],
    offer: ['……（ピエールが見えない壁を必死に押している）', '……（裏通りを指さし、拳を振り回すしぐさ）', '（…どうやら「裏通りのチンピラが壁を作った」と言いたいらしい）'],
    o: [K('thug_punk', 10, 'down_f1', 'ネオン裏通りでストリートチンピラを追い払う')],
    done: ['……（大きな拍手。そして鼻メガネを差し出す）', '（…受け取れ、ということらしい）'] },
  { n: 2, t: '透明なロープ', lv: 13, items: ['cos_tuxedo_tshirt'],
    offer: ['……（見えないロープを引っ張る。その先は地面の下を指している）', '（地下鉄トンネルに何かがあるらしい）'],
    o: [K('rat_subway', 10, 'down_f2', '地下鉄トンネルでメトロラットを倒す'), C('rat_tail', 6, 'down_f2', '見えないロープの正体（ネズミのしっぽ）を集める')],
    done: ['……（しっぽを見て、驚いたふりで尻もち）', '（タキシード柄のTシャツをくれた。たぶん「正装しろ」という意味だ）'] },
  { n: 3, t: '無言の師匠', lv: 15, items: ['cos_clown_shoes'],
    offer: ['……（帽子を取り、胸に当てる。遠くを見つめる）', '（ママ・ローザを指さしている。ローザに何か聞いてほしいらしい）'],
    o: [T('mama_rosa', 'downtown', 'ママ・ローザにピエールの師匠の話を聞く')],
    done: ['……（あなたの話を聞き、うつむく。そして古い靴を差し出した）', '（ローザの話では、師匠のピエロは最後まで一言もしゃべらなかったらしい。…弟子も同じ道を行くようだ）'] },
  { n: 4, t: '最後の公演', lv: 17, items: ['cos_rubber_sword'],
    offer: ['……（大きく手を広げ、公園を指す。観客を集めるしぐさ）', '（公演の邪魔をする連中を追い払ってほしいらしい）'],
    o: [K('thug_skater', 12, 'down_f4', 'セントラル公園でスケボー・チンピラを追い払う'), K('mushroom_park', 10, 'down_f4', '客席を占領するピクニックマッシュをどかす')],
    done: ['「……ありがとう」', '（ピエールが初めてしゃべった！ …と思ったら、口パクだった。ゴム製の剣をくれた）'] },
]);

series('ume', { name: 'ウメばあちゃんのレシピ', region: 'downtown', npc: 'granny_ume', qset: 'qset_ume_bandana' }, [
  { n: 1, t: '亭主のレシピ', lv: 10,
    offer: ['おや、若いの。ばあちゃんの頼みを聞いておくれ。', '死んだ亭主の秘伝スープのレシピ帳が、どこかへ行っちまってねえ。', '裏通りのキノコが材料だったのは覚えてるんだけど。'],
    o: [K('mushroom_neon', 10, 'down_f1', 'ネオン裏通りでネオンキノコを倒す'), C('mushroom_cap', 8, 'down_f1', 'キノコのかさを集める')],
    done: ['このかさの匂い…そうそう、これだよ。', 'でもレシピがないと、あの味は出ないねえ。'] },
  { n: 2, t: 'パン屋の窯', lv: 12, items: ['cos_baguette'],
    offer: ['亭主は昔、パン屋もやってたのさ。焼き窯の跡が地下鉄の倉庫に残ってるはずだよ。', 'レシピ帳を窯に隠したかもしれないねえ。'],
    o: [R('down_f2', '地下鉄トンネルへ行く'), K('mushroom_glow', 10, 'down_f2', '焼き窯の跡に生えたグロウマッシュを片付ける')],
    done: ['窯の中に…焼きかけのバゲットが化石になってたって？ ははは、亭主らしいねえ。', 'レシピ帳は無かったか。そのバゲット、持ってお行き。剣くらいにはなるよ。'] },
  { n: 3, t: '食堂の写真', lv: 14,
    offer: ['…ひとつ心当たりがあるんだよ。', '食堂ローザの店主に、この古い写真を見せておくれ。'],
    o: [T('mama_rosa', 'downtown', 'ママ・ローザに古い写真を見せる')],
    done: ['…ローザが泣いてたって？ そうかい。', 'あの子は、あたしが家を飛び出した日に置いてきた娘なんだよ。', 'レシピ帳は、亭主があの子に渡してたんだねえ。'] },
  { n: 4, t: '三代目の味', lv: 16,
    offer: ['ローザが言うんだ。「一緒にスープを作ろう、母さん」って。', '三十年ぶりの台所だ。材料を集めておくれ。'],
    o: [C('mushroom_cap', 15, 'down_f1', 'スープの材料（キノコのかさ）を集める'), K('rat_alley', 10, 'down_f1', '厨房に入り込むドブネズミを追い払う')],
    done: ['母と娘で作ったスープ…亭主の味だよ。三十年ぶりだ。', 'これは亭主のバンダナさ。三代目の味を守るのは、あんたかもしれないね。'] },
]);

series('skate', { name: 'パークを守れ', region: 'downtown', npc: 'tony', qset: 'qset_skate_sneakers' }, [
  { n: 1, t: '閉鎖のお知らせ', lv: 14,
    offer: ['ヨー！ セントラル公園のスケボー場が「閉鎖」だってよ！', 'チンピラがたむろしてるのが理由らしい。追い出せば撤回されるはずだ！'],
    o: [K('thug_skater', 12, 'down_f4', 'セントラル公園でスケボー・チンピラを追い出す')],
    done: ['サンキュー！ でも、まだ閉鎖の看板が立ってる…誰が立てたんだ？'] },
  { n: 2, t: '空からの監視', lv: 16,
    offer: ['公園の上をラジコン・ドローンが飛び回ってる。あれ、閉鎖の看板と同じマークが付いてるんだ。'],
    o: [K('drone_toy', 10, 'down_f4', 'ラジコン・ドローンを落とす'), C('drone_chip', 5, 'down_f4', 'ドローンのチップを集める')],
    done: ['チップに会社名が…「カイマン不動産」？ どこかで聞いたような。'] },
  { n: 3, t: 'カイ巡査の情報', lv: 18,
    offer: ['カイ巡査なら、街の不動産のことに詳しいはずだ。聞いてきてくれ！'],
    o: [T('officer_kai', 'downtown', 'カイ巡査に「カイマン不動産」のことを聞く')],
    done: ['カイマン不動産はドン・カイマンの会社…公園を潰してカジノを建てる気だって！？', '…上等だ。俺たちのパークは渡さねえ。'] },
  { n: 4, t: 'パークキーパー', lv: 20,
    offer: ['工事の下見に来たライダーどもが高架ハイウェイにいる。叩き出してくれ！', 'それと、再開に向けて公園の大掃除だ！'],
    o: [K('thug_biker', 12, 'down_f3', '高架ハイウェイでハイウェイ・ライダーを叩き出す'), K('mushroom_park', 12, 'down_f4', '公園のピクニックマッシュを片付ける')],
    done: ['スケボー場、再開決定だ！！', 'みんなでサインを入れた靴だ。受け取ってくれ、パークキーパー！'] },
]);

series('scoop', { name: '地下鉄の怪物', region: 'downtown', npc: 'mika', qset: 'qset_press_shades' }, [
  { n: 1, t: '怪物の噂', lv: 12,
    offer: ['新聞記者のミカよ。いま追ってるのは「地下鉄の怪物」の噂。', 'まずは証拠写真。トンネルのネズミを追い払って、カメラを仕掛けてきて！'],
    o: [K('rat_subway', 12, 'down_f2', '地下鉄トンネルでメトロラットを追い払う')],
    done: ['写ってた！ 王冠をかぶった巨大なネズミ…これはスクープよ！'] },
  { n: 2, t: '消された記事', lv: 14,
    offer: ['大変！ 編集部のデータが、のぞき見ドローンに盗まれたの！', '裏通りのドローンを落として、チップを取り返して！'],
    o: [K('drone_peeping', 10, 'down_f1', 'ネオン裏通りでのぞき見ドローンを落とす'), C('drone_chip', 6, 'down_f1', 'ドローンのチップを取り返す')],
    done: ['データは取り戻せた。でも…チップの中に市長秘書のメールが。', '「怪物には餌をやり続けろ」？ どういうこと？'] },
  { n: 3, t: 'ネズミの王', lv: 17,
    offer: ['怪物に餌をやって、地下鉄の工事を止めさせてる人がいる。', '本人に…いえ、本ネズミに会いにいくわよ！'],
    o: [B('boss_rat_king', 'down_f2', '地下鉄トンネルでラットキングを倒す')],
    done: ['…あなたなら、どうする？'],
    choice: { prompt: 'ラットキングの巣で、市長秘書の名前入りの餌袋が見つかった。ミカが迷っている。「記事にしたら秘書はクビ。でも、秘書にも家族が…」',
      a: { tag: 'publish', text: 'すべて記事にする（真実を書く）', dialog: ['…そうね。記者が真実を書かなくてどうするの。', '朝刊の一面、空けておくわ！'] },
      b: { tag: 'deal', text: '秘書と取引する（記事を伏せて、もっと大きなネタをもらう）', dialog: ['取引…ね。ネタ元を持っておくのも記者の仕事、か。', '秘書に会いに行きましょう。'] } } },
  { n: '4a', t: '朝刊を守れ', lv: 18, branch: 'a', from: 3, pre: 3,
    offer: ['記事を嫌う連中が、印刷所に落書き小僧を送り込んでるわ！'],
    o: [K('thug_graffiti', 15, 'down_f2', '地下鉄トンネルでグラフィティ小僧を止める'), C('neon_bulb', 4, 'down_f2', '割られた看板のネオン管を回収する')],
    done: ['輪転機は無事よ！ 刷り上がった！'] },
  { n: '5a', t: '真実は眩しい', lv: 20, branch: 'a', from: 3, pre: '4a', last: true,
    offer: ['朝刊を街に配るの。まずは食堂ローザと、ビーチのリコの売店！'],
    o: [T('mama_rosa', 'downtown', 'ママ・ローザに朝刊を届ける'), T('rico', 'beach', 'リコに朝刊を届ける')],
    done: ['街じゅうがこの記事の話題で持ちきり！ 秘書は辞職、地下鉄の工事も再開よ。', 'このサングラス、あげる。真実はだいたい眩しいから。'] },
  { n: '4b', t: 'ネタ元の代償', lv: 18, branch: 'b', from: 3, pre: 3,
    offer: ['秘書の話だと、怪物の餌代はドンの会社から出てた。', '証拠は、高架ハイウェイの交通監視ドローンの記録よ。'],
    o: [K('drone_traffic', 12, 'down_f3', '高架ハイウェイで交通監視ドローンを落とす'), C('drone_chip', 6, 'down_f3', '記録の入ったチップを集める')],
    done: ['記録が手に入った。秘書は約束通り、ドンの帳簿の在りかも教えてくれたわ。'] },
  { n: '5b', t: '伏せた記事', lv: 20, branch: 'b', from: 3, pre: '4b', last: true,
    offer: ['帳簿の話はカイ巡査に流しておくの。', 'それと…口封じに秘書を狙うライダーたちから守ってあげて。'],
    o: [T('officer_kai', 'downtown', 'カイ巡査に帳簿の情報を渡す'), K('thug_biker', 10, 'down_f3', '秘書を付け狙うハイウェイ・ライダーを追い払う')],
    done: ['記事は伏せた。でも、もっと大きな悪の尻尾を掴んだわ。', '記者は書くだけが仕事じゃない…ってことね。このサングラス、あなたにあげる。'] },
]);

series('neonsign', { name: '消えるネオン看板', region: 'downtown', npc: 'dash_garage', qset: 'qset_neon_tube_sword' }, [
  { n: 1, t: '消える看板', lv: 12,
    offer: ['ガレージの副業でネオン看板も直してるんだが、最近やたらと看板が消えるんだ。', '裏通りで割れたネオン管を拾ってきてくれ。原因を調べる。'],
    o: [K('mushroom_neon', 8, 'down_f1', 'ネオン裏通りでネオンキノコを倒す'), C('neon_bulb', 4, 'down_f1', '割れたネオン管を拾う')],
    done: ['ネオン管の中の光が…吸い取られてる。'] },
  { n: 2, t: '光を食べるキノコ', lv: 15,
    offer: ['地下鉄のグロウマッシュは、ネオンの光で育つらしい。数を減らしてくれ。'],
    o: [K('mushroom_glow', 15, 'down_f2', '地下鉄トンネルでグロウマッシュを倒す')],
    done: ['キノコの傘の模様…どこかの看板の字と同じだ。「OPEN」？'] },
  { n: 3, t: '最初の看板', lv: 17,
    offer: ['昔、この街で最初に灯ったネオン看板が、地下鉄に捨てられたって話だ。', '古株のママ・ローザなら何か知ってるはずだ。'],
    o: [T('mama_rosa', 'downtown', 'ママ・ローザに最初のネオン看板の話を聞く')],
    done: ['ローザの食堂の看板！ あれが街で最初のネオンで、店の改装のときに地下に捨てられた…。', 'キノコどもは、その看板の光から生まれたのか。'] },
  { n: 4, t: '看板の行方', lv: 19,
    offer: ['捨てられた看板の部品を、ハイウェイのネオンラットが巣に持ち込んでるらしい。取り返すぞ！'],
    o: [K('rat_neon', 12, 'down_f3', '高架ハイウェイでネオンラットを倒す'), C('neon_bulb', 5, 'down_f3', '看板の部品（ネオン管）を取り返す')],
    done: ['看板の部品が揃った！ あとは組み立てて灯すだけだ。'] },
  { n: 5, t: 'OPEN', lv: 22,
    offer: ['看板を灯すには強い電流が要る。ハイウェイの交通監視ドローンのバッテリーと…', 'ライダーのバイクからも分けてもらおう。ちゃんと倒してからな。'],
    o: [K('thug_biker', 12, 'down_f3', 'ハイウェイ・ライダーを倒す'), K('drone_traffic', 10, 'down_f3', '交通監視ドローンを落とす')],
    done: ['灯った…！ 「OPEN」。ローザの食堂の、街で最初の看板だ。', 'キノコどもも、もう看板の光を食べには来ないだろう。', '余った管で剣を作ってみた。持ってけ！'] },
]);

// ============================================================ slums ポート・スラム（Lv20〜36）
series('toxic', { name: '黒い排水', region: 'slums', npc: 'dan_sweeper', qset: 'qset_hazmat_boots' }, [
  { n: 1, t: '真っ黒な排水口', lv: 20,
    offer: ['おう、手を貸してくれ。俺はダン、この港の清掃員だ。三十年やってる。', '最近、倉庫街の排水が真っ黒でな。ヘドロスライムが湧いてやがる。'],
    o: [K('slime_toxic', 15, 'slums_f1', '倉庫街でヘドロスライムを倒す')],
    done: ['こいつら、普通のヘドロじゃねえ。油が混ざってる。'] },
  { n: 2, t: '油の出どころ', lv: 23,
    offer: ['ドックラットが油まみれで走り回ってる。そいつらの体についたゼリーを調べりゃ、出どころがわかるはずだ。'],
    o: [K('rat_dock', 12, 'slums_f1', '倉庫街でドックラットを倒す'), C('toxic_goo', 8, 'slums_f1', '毒々しいゼリーを集める')],
    done: ['ゼリーの中に、造船所の塗料が混じってる。…造船所か。'] },
  { n: 3, t: '造船所の秘密', lv: 26,
    offer: ['造船所に行ってくれ。オイルスライムが廃油を吸って膨らんでるらしい。見張りもいるから気をつけな。'],
    o: [K('slime_oil', 12, 'slums_f2', '造船所でオイルスライムを倒す'), K('thug_gunner', 8, 'slums_f2', '見張りのギャングの鉄砲玉を黙らせる')],
    done: ['廃油を海に流してたのは…ドンの密輸船の修理場だ。'] },
  { n: 4, t: 'きれいな港', lv: 29,
    offer: ['タンクに話を通しておいた。廃油を止める部品を作ってもらってる。受け取ってきてくれ。', '戻ったら、残りのオイルスライムを一掃だ！'],
    o: [T('tank', 'slums', 'タンクから排水弁の部品を受け取る'), K('slime_oil', 15, 'slums_f2', '造船所のオイルスライムを一掃する')],
    done: ['排水が…透明だ。三十年で一番きれいな港だよ。', 'この防護ブーツをやる。俺と同じ型の最新版だ。'] },
]);

series('junkrobot', { name: '相棒ロボ「ボルト」', region: 'slums', npc: 'rina', qset: 'qset_junk_blaster' }, [
  { n: 1, t: '相棒がほしい', lv: 30,
    offer: ['タンクさんの弟子のリナです！ 自分だけの相棒ロボを作りたいんです！', 'まずは歯車。廃線路のスクラップロボから…ちょっと分けてもらってきてください！'],
    o: [K('robot_scrap', 10, 'slums_f4', '廃線路でスクラップロボを倒す'), C('robot_gear', 8, 'slums_f4', 'ロボの歯車を集める')],
    done: ['いい歯車！ …あれ？ この歯車、私の刻印が入ってる？'] },
  { n: 2, t: '盗まれた設計図', lv: 31,
    offer: ['私が前に描いた設計図が盗まれてたんです。スクラップロボたちは、その設計図で作られてる…！', '廃線路のスクラップ屋が怪しいです。'],
    o: [K('thug_scrapper', 12, 'slums_f4', '廃線路でスクラップ屋を問い詰める（倒す）'), C('rusty_bolt', 8, 'slums_f4', '証拠のサビたボルトを集める')],
    done: ['スクラップ屋の荷物に設計図のコピーが！ 誰かに売られたみたいです。'] },
  { n: 3, t: '設計図の買い手', lv: 33,
    offer: ['設計図を買ったのは質屋のサルさんだって。…聞いてきてもらえますか？ 私、あの人ちょっと苦手で。'],
    o: [T('sal_pawn', 'slums', 'サルに設計図の買い手を聞く')],
    done: ['サルさんが買って、ドンの部下に転売…。', '私の設計図、ロボ軍団の材料にされるところだったんですね。'] },
  { n: 4, t: 'ジャイアント・トラブル', lv: 34,
    offer: ['設計図の最後の一枚を、ジャイアントラットが巣に持ち込んだって！'],
    o: [K('rat_giant', 15, 'slums_f4', '廃線路でジャイアントラットを倒す')],
    done: ['取り返せた！ これで設計図が全部揃いました！'] },
  { n: 5, t: 'ボルト起動', lv: 36,
    offer: ['組み立てには硬い装甲板が要るんです。密輸船のサビガニの甲羅が代わりになるかも！'],
    o: [K('crab_rust', 12, 'slums_f3', '密輸船でサビガニを倒す'), C('crab_shell', 8, 'slums_f3', '装甲板にするカニの甲羅を集める')],
    done: ['起動…します！', '「ボルト！」 しゃべった！！ この子の名前はボルトです！', 'ボルトと私で作った銃、受け取ってください！'] },
]);

series('ghostship', { name: '霧の幽霊船', region: 'slums', npc: 'old_mori', qset: 'qset_captain_coat' }, [
  { n: 1, t: '霧の船影', lv: 28,
    offer: ['わしはモリ。昔は船長じゃった。…霧の夜、沖に幽霊船が出るという噂を知っとるか？', '造船所の連中が怯えとる。様子を見てきてくれ。'],
    o: [K('flamingo_punk', 10, 'slums_f2', '造船所でパンク・フラミンゴを追い払う'), K('thug_gunner', 10, 'slums_f2', '造船所の鉄砲玉から話を聞き出す（倒す）')],
    done: ['「幽霊船は、霧が晴れると密輸船に化ける」…造船所の連中はそう言っとったか。'] },
  { n: 2, t: '船倉のネズミ', lv: 30,
    offer: ['密輸船に忍び込め。ふなネズミどもが船倉を走り回っとるはずじゃ。'],
    o: [R('slums_f3', '密輸船に乗り込む'), K('rat_ship', 12, 'slums_f3', '船倉のふなネズミを追い払う')],
    done: ['船倉の柱に…わしの船の名前が刻まれておったと？', 'あれは、わしの船じゃ！'] },
  { n: 3, t: '船長ハーケン', lv: 33,
    offer: ['今の船長はハーケン。…わしの一番弟子じゃった男じゃ。', 'あいつに会って、なぜ密輸などしておるのか確かめてくれ。'],
    o: [B('boss_captain', 'slums_f3', '密輸船でキャプテン・ハーケンを倒す')],
    done: ['…あいつは、何と言っておった？'],
    choice: { prompt: '倒れたハーケンが言う。「親父さんの船を守るには、ドンに従うしかなかったんだ」。…モリにどう伝える？',
      a: { tag: 'forgive', text: 'ハーケンの事情を伝え、許すよう頼む', dialog: ['…あの馬鹿弟子め。船を守るために、汚れ役を…。', 'わしが会いに行こう。…いや、まずはお前さんに頼みがある。'] },
      b: { tag: 'judge', text: 'ハーケンの罪を伝え、裁きを求める', dialog: ['…そうか。船を汚したことに変わりはない。', 'わしの手で、けじめをつけねばならん。'] } } },
  { n: '4a', t: '師弟の手紙', lv: 33, branch: 'a', from: 3, pre: 3,
    offer: ['ハーケンへの手紙じゃ。DJパルスの船便で、こっそり届けてもらってくれ。', 'ドンの見張りに見つからんようにな。'],
    o: [T('dj_pulse', 'slums', 'DJパルスに手紙を託す'), K('thug_smuggler', 15, 'slums_f3', 'ドンの見張りの船員を遠ざける')],
    done: ['ハーケンから返事が来た。「もう一度、親父さんの船の舵を握らせてくれ」と。'] },
  { n: '5a', t: '霧が晴れたら', lv: 34, branch: 'a', from: 3, pre: '4a', last: true,
    offer: ['船をドンから取り戻す。船に残るドンの手下を片付けてくれ！'],
    o: [K('thug_smuggler', 20, 'slums_f3', '密輸船の船員を片付ける'), K('crab_rust', 10, 'slums_f3', '甲板のサビガニを払い落とす')],
    done: ['霧が晴れた。…船の舵には、わしとハーケンの手が並んでおる。', 'このコートはもう要らん。新しい船長はハーケンじゃ。お前さんが着てくれ。'] },
  { n: '4b', t: 'けじめの証拠', lv: 33, branch: 'b', from: 3, pre: 3,
    offer: ['密輸の証拠、密輸船の海図を手に入れろ。それをダウンタウンのカイ巡査に突き出す。'],
    o: [C('pirate_map', 1, 'slums_f3', '密輸船の海図を手に入れる'), T('officer_kai', 'downtown', 'カイ巡査に密輸の証拠を渡す')],
    done: ['カイ巡査が動いた。密輸船は差し押さえじゃ。'] },
  { n: '5b', t: '幽霊船の最期', lv: 34, branch: 'b', from: 3, pre: '4b', last: true,
    offer: ['差し押さえの前に、船の中の残党が暴れとる。', '…幽霊船の噂を終わらせてくれ。わしの代わりに。'],
    o: [K('thug_smuggler', 20, 'slums_f3', '密輸船の残党を片付ける'), K('rat_ship', 15, 'slums_f3', '船倉のふなネズミを片付ける')],
    done: ['幽霊船の噂は、今日で終わりじゃ。', 'ハーケンには…いつか面会に行くとしよう。このコートはお前さんに。'] },
]);

series('bubbles', { name: '世界一のシャボン玉', region: 'slums', npc: 'bubbles', kind: 'joke' }, [
  { n: 1, t: 'シャボン液の秘密', lv: 20, items: ['cos_bathrobe'],
    offer: ['ぼくの夢は、港を包むくらい大きなシャボン玉を作ることなんだ！', 'シャボン液の材料は…ヘドロスライムのゼリー！ 泡立ちが最高なんだよ！'],
    o: [C('toxic_goo', 8, 'slums_f1', '毒々しいゼリーを集める')],
    done: ['いい泡立ち！ …ちょっと臭い？ 気のせい気のせい。', 'お礼にバスローブ。シャボン作りは湯上がりの気分でやるのが一番！'] },
  { n: 2, t: '泡を守れ', lv: 23, items: ['cos_water_gun'],
    offer: ['シャボン玉を作ると、ドックラットが割りに来るんだ！ 追っ払って！'],
    o: [K('rat_dock', 12, 'slums_f1', '倉庫街でドックラットを追い払う')],
    done: ['ありがとう！ これはシャボン液が出る水鉄砲。港の子どもに大人気さ！'] },
  { n: 3, t: '海に落ちても', lv: 26, items: ['cos_swim_ring'],
    offer: ['巨大シャボン玉に乗って空を飛びたい。でも落ちたら海だ。', '浮き輪を作ろう。材料は…フラミンゴの羽で！'],
    o: [C('flamingo_feather', 8, 'slums_f2', 'フラミンゴの羽を集める'), K('flamingo_punk', 8, 'slums_f2', '造船所のパンク・フラミンゴを倒す')],
    done: ['羽でできた浮き輪！ …浮くかな。とりあえず頭にかぶっておこう。君にもあげる！'] },
  { n: 4, t: '港の空へ', lv: 29, items: ['cos_bubble_wings'],
    offer: ['最後の材料はオイルスライムの油。七色に光るんだ！'],
    o: [C('toxic_goo', 10, 'slums_f2', '油の混じったゼリーを集める'), K('slime_oil', 12, 'slums_f2', '造船所でオイルスライムを倒す')],
    done: ['見て！ 港の空に、七色の巨大シャボン玉！！', '…割れた。三秒で。でも最高の三秒だった！', 'これ、最高傑作のシャボンの羽！ 三秒ごとに割れて、三秒で生え直すよ！'] },
]);

series('dockrave', { name: 'サウンドバトル', region: 'slums', npc: 'dj_pulse', prereq: ['m08_rave'], qset: 'qset_noise_headphones' }, [
  { n: 1, t: '挑戦状', lv: 22,
    offer: ['聞いてくれ！ 倉庫街の「DJノイズ」って奴が、俺にサウンドバトルを挑んできた！', 'あいつの手下のゴロツキが、俺のレコードを狙ってる。守ってくれ！'],
    o: [K('thug_dockhand', 15, 'slums_f1', '倉庫街で港のゴロツキを追い払う'), C('stolen_vinyl', 5, 'slums_f1', '奪われたレコードを取り返す')],
    done: ['レコードは無事だ。…あいつ、本気だな。'] },
  { n: 2, t: '客を集めろ', lv: 25,
    offer: ['バトルは客の盛り上がりで決まる。造船所でパンク・フラミンゴが通り道をふさいでるんだ。', '客の道を作ってくれ！'],
    o: [K('flamingo_punk', 15, 'slums_f2', '造船所のパンク・フラミンゴをどかす')],
    done: ['道ができた！ 客がどんどん来てる！'] },
  { n: 3, t: 'ノイズの正体', lv: 28,
    offer: ['DJノイズのこと、ゴースト・リリィが知ってるらしい。…ちょっと怖いけど、聞いてきてくれ。'],
    o: [T('job_lily', 'slums', 'ゴースト・リリィにDJノイズのことを聞く')],
    done: ['DJノイズは…昔、俺と組んでたDJの弟だった。兄貴は密輸船の事故で…。', '…バトルで、ちゃんと向き合うよ。'] },
  { n: 4, t: 'バトル当日', lv: 32,
    offer: ['バトル当日だ！ 密輸船の連中が、会場の電源を落としに来るらしい。止めてくれ！'],
    o: [K('thug_smuggler', 15, 'slums_f3', '密輸船の船員を止める'), K('rat_ship', 10, 'slums_f3', '電線をかじるふなネズミを追い払う')],
    done: ['引き分けだった。…でもノイズが笑ったんだ。兄貴そっくりの顔で。', 'ノイズが「あんたの用心棒に」ってこれを。静寂のヘッドホンさ。'] },
]);

// ============================================================ swamp グレイズ村（Lv22〜45）
series('tad', { name: '白いワニを見たい', region: 'swamp', npc: 'tad', qset: 'qset_tad_goggles' }, [
  { n: 1, t: '探検の始まり', lv: 22,
    offer: ['ぼく、タッド！ 伝説の白いワニを見たいんだ！', 'でも沼の入口は虫だらけで…ヌマカを追い払ってくれる？'],
    o: [K('mosquito_swamp', 12, 'swamp_f1', '湿地の入口でヌマカを追い払う')],
    done: ['すごい！ これで探検に行ける！ …ママには内緒ね。'] },
  { n: 2, t: '段ボールの鎧', lv: 26, items: ['cos_cardboard_armor'],
    offer: ['探検には鎧が要るよね！ 段ボールで作ったんだ。', '補強にヘビの抜け殻を貼りたいんだ！'],
    o: [K('snake_reed', 8, 'swamp_f1', '湿地の入口でアシヘビを倒す'), C('snake_skin', 8, 'swamp_f1', 'ヘビの抜け殻を集める')],
    done: ['できた！ 段ボールの鎧！ きみにもひとつあげる！'] },
  { n: 3, t: 'ワニの巣へ', lv: 30,
    offer: ['ブーンじいさんが、白いワニはワニの巣にいるって。', '…ぼくの代わりに見てきて！ 写真を撮ってきて！'],
    o: [K('gator_swamp', 10, 'swamp_f2', 'マングローブ迷路で沼ワニを追い払う'), R('swamp_f3', 'ワニの巣へ行き、白いワニを見る')],
    done: ['うわぁ、本当にいた！ 真っ白だ！ …ぼく、大きくなったらレンジャーになる！', 'この探検ゴーグル、あげる。最初に見つけたのはきみだから！'] },
]);

series('ranger', { name: '沼のレンジャー', region: 'swamp', npc: 'sue', qset: 'qset_ranger_hat' }, [
  { n: 1, t: '罠だらけの沼', lv: 23,
    offer: ['グレイズ自然保護区のレンジャー、スーよ。湿地の入口に密猟者の罠が仕掛けられてる。', '罠にかかって暴れてる沼ワニを、ひとまず鎮めて。'],
    o: [K('gator_swamp', 10, 'swamp_f1', '湿地の入口で暴れる沼ワニを鎮める'), C('gator_tooth', 5, 'swamp_f1', '罠に残された牙を回収する')],
    done: ['牙に焼き印…売り物の印ね。'] },
  { n: 2, t: '毒キノコの抜け道', lv: 26,
    offer: ['密猟者は毒キノコの群生地を抜け道にしてる。道を塞いで。'],
    o: [K('mushroom_bog', 15, 'swamp_f1', '湿地の入口の沼地の毒キノコを刈る')],
    done: ['足跡は村の方へ続いてる…まさか、村の中に？'] },
  { n: 3, t: '村の聞き込み', lv: 28,
    offer: ['ブードゥー・ベティとブーンさんなら、村に出入りする人間を全部知ってるわ。'],
    o: [T('voodoo_betty', 'swamp', 'ベティに聞き込みをする'), T('old_boone', 'swamp', 'ブーンじいさんに聞き込みをする')],
    done: ['ブーンさんの昔の弟子が、ヘビ皮のブローカーをやってる…？'] },
  { n: 4, t: 'マングローブの倉庫', lv: 31,
    offer: ['ブローカーはマングローブ迷路に倉庫を持ってる。ボアの皮を集めてるはず。'],
    o: [K('snake_mangrove', 12, 'swamp_f2', 'マングローブ迷路でマングローブ・ボアを鎮める'), C('snake_skin', 10, 'swamp_f2', '密猟の証拠（ヘビの抜け殻）を押さえる')],
    done: ['倉庫にあった帳簿、全部押さえたわ。'] },
  { n: 5, t: '保護区の夜明け', lv: 33,
    offer: ['最後の仕上げ。倉庫を守るオオヌマカとガスマッシュを散らして、証拠を村まで運ぶの。'],
    o: [K('mosquito_giant', 15, 'swamp_f2', 'オオヌマカの群れを散らす'), K('mushroom_spore', 8, 'swamp_f2', 'ガスマッシュを散らす')],
    done: ['ブローカーは捕まった。罠も全部外したわ。', 'このレンジャーハット、あなたに。グレイズの沼の名誉レンジャーよ。'] },
]);

series('voodoo', { name: '霧の鬼火', region: 'swamp', npc: 'voodoo_betty', qset: 'qset_voodoo_mask' }, [
  { n: 1, t: 'ヘビ皮のお守り', lv: 36,
    offer: ['…あんた、鬼火を見たことはあるかい？ 霧の水路に、夜な夜な浮かぶのさ。', '近づく前にお守りがいる。ヘビの抜け殻を集めておいで。'],
    o: [C('snake_skin', 12, 'swamp_f2', 'お守りにするヘビの抜け殻を集める')],
    done: ['いいお守りができた。これで鬼火の声が聞けるよ。'] },
  { n: 2, t: '鬼火の声', lv: 39,
    offer: ['夜の霧の水路へ行って、鬼火を鎮めておいで。声に耳を貸すんじゃないよ。'],
    o: [K('ghost_bayou', 10, 'swamp_f4', '夜の霧の水路でバイユーの鬼火を鎮める（夜だけ出る）'), K('snake_fog', 8, 'swamp_f4', 'キリヘビを追い払う')],
    done: ['「帰りたい」と言ってたって？ …やっぱりね。'] },
  { n: 3, t: '沈んだ村', lv: 41,
    offer: ['あの鬼火は、五十年前に沼に沈んだ村の人たちの魂さ。', '霧の中のヘビどもが、魂の欠片を飲み込んでる。取り返しておくれ。'],
    o: [K('snake_fog', 12, 'swamp_f4', '霧の水路でキリヘビを倒す'), C('snake_skin', 10, 'swamp_f4', '魂の欠片が絡んだ抜け殻を集める')],
    done: ['…欠片は揃った。さあ、どうする？'],
    choice: { prompt: 'ベティが魂の欠片を握りしめて言う。「この魂を、空へ還すか。それとも…強い薬にして、村を守る力にするか」',
      a: { tag: 'rest', text: '魂を空へ還す（成仏させる）', dialog: ['…そうだね。帰る場所に、帰してやろう。', '霧を晴らせば、魂は空へ還れる。'] },
      b: { tag: 'brew', text: '薬にして、村を守る力にする', dialog: ['…ふふ。あんた、なかなか沼の人間らしいね。', '死んだ者の力を、生きてる者のために。それもまた供養さ。'] } } },
  { n: '4a', t: '霧を晴らす', lv: 43, branch: 'a', from: 3, pre: 3,
    offer: ['霧はキリタケの胞子から出てる。刈り取っておくれ。'],
    o: [K('mushroom_fog', 20, 'swamp_f4', '霧の水路のキリタケを刈る'), C('mushroom_cap', 10, 'swamp_f4', '胞子の詰まったかさを集める')],
    done: ['霧が薄くなってきた。鬼火が…空へ昇っていくよ。'] },
  { n: '5a', t: '還る灯', lv: 45, branch: 'a', from: 3, pre: '4a', last: true,
    offer: ['最後に、ブーンじいさんに伝えておくれ。沈んだ村は、じいさんの生まれ故郷なんだ。', '水路のミスト・ゲイターが邪魔をしないように、鎮めてからね。'],
    o: [K('gator_fog', 12, 'swamp_f4', '霧の水路のミスト・ゲイターを鎮める'), T('old_boone', 'swamp', 'ブーンじいさんに沈んだ村のことを伝える')],
    done: ['…じいさん、泣いてたろう。五十年ぶりに、故郷の灯を見送ったんだ。', 'この仮面はもう要らない。あんたが持っておいき。'] },
  { n: '4b', t: '魂の薬', lv: 43, branch: 'b', from: 3, pre: 3,
    offer: ['薬には、女王の羽とワニの牙がいる。強い命の材料さ。'],
    o: [K('mosquito_queen', 8, 'swamp_f3', 'ワニの巣でヌマカの女王を倒す'), C('mosquito_wing', 10, 'swamp_f3', 'ヌマカの羽を集める'), C('gator_tooth', 10, 'swamp_f3', 'ワニの牙を集める')],
    done: ['いい材料だ。…魂たちも、力を貸すと言ってるよ。'] },
  { n: '5b', t: '沼の守り火', lv: 45, branch: 'b', from: 3, pre: '4b', last: true,
    offer: ['薬は村の周りに撒く。外から来るミスト・ゲイターが近寄れなくなるのさ。', '撒くあいだ、守っておくれ。'],
    o: [K('gator_fog', 15, 'swamp_f4', '霧の水路のミスト・ゲイターを退ける'), K('mushroom_fog', 10, 'swamp_f4', 'キリタケを刈る')],
    done: ['村の周りに、青い守り火が灯った。…魂たちは、ここに残ることを選んだんだ。', 'この仮面をつければ、守り火と話せる。あんたにやるよ。'] },
]);

series('geko', { name: 'カエルの王子', region: 'swamp', npc: 'geko', kind: 'joke' }, [
  { n: 1, t: '呪われた王子', lv: 25, items: ['cos_frog_crown'],
    offer: ['ゲコッ。わしはカエル王国の王子じゃ。悪い魔女の呪いで、人間のおじさんにされてしまったのじゃ。', '呪いを解くには…いや、キスは要らん！ 要らんと言っとるじゃろう！', 'まずは王冠を取り戻したい。湿地の入口のアシヘビが持っていった…はずじゃ。'],
    o: [K('snake_reed', 10, 'swamp_f1', '湿地の入口でアシヘビから王冠を取り戻す')],
    done: ['王冠じゃ！ …百円ショップのシール？ 王家の印じゃ、気にするでない。', 'おぬしにも一つ授けよう。'] },
  { n: 2, t: '王家の履物', lv: 28, items: ['cos_gator_slippers'],
    offer: ['王子たるもの、履物も王家のものでなければならん。ワニ柄の何かを持ってくるのじゃ。'],
    o: [K('gator_swamp', 12, 'swamp_f1', '湿地の入口で沼ワニを倒す'), C('gator_tooth', 6, 'swamp_f1', 'ワニの牙を集める')],
    done: ['ワニのスリッパ！ よいよい。…わしが作ったのじゃ。夜なべしてな。'] },
  { n: 3, t: '不届き者', lv: 32, items: ['cos_mosquito_wings'],
    offer: ['昨夜、わしの尊い首筋を刺した不届き者がおる。マングローブのオオヌマカじゃ！ 成敗せい！'],
    o: [K('mosquito_giant', 12, 'swamp_f2', 'マングローブ迷路でオオヌマカを成敗する'), C('mosquito_wing', 6, 'swamp_f2', '戦利品のヌマカの羽を集める')],
    done: ['成敗したか！ 戦利品の羽はおぬしが着けるがよい。…かゆい。'] },
  { n: 4, t: '王子の正装', lv: 36, items: ['cos_pumpkin_shorts'],
    offer: ['呪いを解く儀式には正装がいる。かぼちゃパンツじゃ。', '儀式のやり方は…ブードゥー・ベティに聞いてまいれ。'],
    o: [T('voodoo_betty', 'swamp', 'ベティに「呪いを解く儀式」のことを聞く')],
    done: ['ベティは何と？ 「あのおじさんは三十年前から村にいる、ただのおじさんだよ」…と？', '…ゲコッ。き、聞かなかったことにする。ほれ、かぼちゃパンツじゃ。'] },
  { n: 5, t: '王子の儀式', lv: 40, items: ['cos_leek'],
    offer: ['儀式の最後じゃ。ワニの巣のヌマカの女王とヌシヘビを倒し、月に向かって「ゲコッ」と三回鳴くのじゃ！'],
    o: [K('mosquito_queen', 6, 'swamp_f3', 'ワニの巣でヌマカの女王を倒す'), K('snake_king', 6, 'swamp_f3', 'ワニの巣でヌシヘビを倒す')],
    done: ['ゲコッ、ゲコッ、ゲコッ！ …戻らんのう。', 'まあよい。人間のおじさんも悪くないと思えてきた。おぬしと冒険できたからのう。', '王家の笏を授ける。…ネギに見える？ 王家の笏じゃ。'] },
]);

series('legacy', { name: '沼の主の卵', region: 'swamp', npc: 'old_boone', prereq: ['m10_grandpa'], qset: 'qset_swamp_fang' }, [
  { n: 1, t: '主のいない沼', lv: 40,
    offer: ['グランパが倒れてから、沼のワニどもが荒れておる。主がいないと沼は乱れるんじゃ。', 'ワニの巣のアルビノゲイターが縄張り争いをしとる。少し静めてくれ。'],
    o: [K('gator_albino', 10, 'swamp_f3', 'ワニの巣でアルビノゲイターを静める')],
    done: ['…巣の奥で、大きな卵を見つけたと？'] },
  { n: 2, t: '主の卵', lv: 42,
    offer: ['グランパの卵じゃ。あいつは最期に、次の主を残していったんじゃな。', '卵を狙うヌシヘビを追い払ってくれ。'],
    o: [K('snake_king', 12, 'swamp_f3', '卵を狙うヌシヘビを追い払う'), C('snake_skin', 8, 'swamp_f3', '巣を覆うヘビの抜け殻を片付ける')],
    done: ['よし。卵は温かい。もうすぐじゃ。'] },
  { n: 3, t: '女王の襲来', lv: 43,
    offer: ['卵の匂いを嗅ぎつけて、ヌマカの女王が群れで来おった！'],
    o: [K('mosquito_queen', 12, 'swamp_f3', 'ヌマカの女王の群れを追い払う'), C('mosquito_wing', 8, 'swamp_f3', '巣に散った羽を片付ける')],
    done: ['…殻にひびが入ったぞ！'] },
  { n: 4, t: '新しい主', lv: 45,
    offer: ['生まれる瞬間に、もう一度だけ戦ってほしい相手がおる。…グランパの影じゃ。', '巣に残った主の気配が、最後の試しをするじゃろう。'],
    o: [B('boss_gator', 'swamp_f3', 'ワニの巣でグランパ・ゲイター（主の影）を倒す')],
    done: ['生まれた…！ 小さいが、グランパと同じ目をしとる。', 'グランパの抜け落ちた牙を刀に打ち直した。新しい主を守ったお前さんにこそふさわしい。'] },
]);

// ============================================================ casino ゴールデン・ストリップ（Lv42〜60）
series('lou', { name: 'ラッキー・ルーの賭け', region: 'casino', npc: 'lou', qset: 'qset_lucky_chain' }, [
  { n: 1, t: '負けっぱなしの男', lv: 44,
    offer: ['へへ…ラッキー・ルーってのは皮肉さ。俺は生まれてこのかた一度も勝ったことがない。', 'でも今回は違う！ スロットがイカサマしてるって掴んだんだ。砂漠ハイウェイのスロットロボを調べてくれ！'],
    o: [K('robot_slot', 12, 'casino_f1', '砂漠ハイウェイでスロットロボを調べる（倒す）'), C('robot_gear', 6, 'casino_f1', '細工された歯車を集める')],
    done: ['歯車に細工が…やっぱりイカサマだ！'] },
  { n: 2, t: 'チップの亡霊', lv: 49,
    offer: ['地下金庫に「チップの亡霊」が出るらしい。負けた客の未練だって話だ。', '…俺の親父も、ここで全部すった。'],
    o: [K('ghost_chip', 15, 'casino_f2', '地下金庫でチップの亡霊を鎮める'), C('ghost_wisp', 6, 'casino_f2', '亡霊のゆらめきを集める')],
    done: ['亡霊の中に…親父の声がしたって？'] },
  { n: 3, t: '親父の声', lv: 52,
    offer: ['頼む。もう一度、金庫に行ってくれ。親父がいるなら…。', 'カジノの用心棒が邪魔をするはずだ。'],
    o: [K('thug_bouncer', 15, 'casino_f2', '地下金庫でカジノの用心棒を退ける'), K('ghost_chip', 10, 'casino_f2', 'チップの亡霊をかき分ける')],
    done: ['…親父は、何て？'],
    choice: { prompt: '亡霊となったルーの父が現れた。「ルー…あと一回だけ、勝負させてくれ。そうすれば成仏できる」',
      a: { tag: 'rest', text: '父を説得して、勝負なしで成仏させる', dialog: ['…親父、もういいんだ。俺はあんたの借金を返し終わったよ。', 'ゆっくり休んでくれ。'] },
      b: { tag: 'bet', text: '父に最後の勝負をさせる', dialog: ['…わかったよ、親父。最後の一回だ。', '勝負の場所は、VIPフロアのジャックポット台だ！'] } } },
  { n: '4a', t: '借金の清算', lv: 53, branch: 'a', from: 3, pre: 3,
    offer: ['親父が成仏するには、借用書を全部燃やさなきゃならないらしい。', '用心棒が金庫の奥に持ってる。'],
    o: [K('thug_bouncer', 20, 'casino_f2', '地下金庫の用心棒から借用書を取り返す'), C('casino_chip', 15, 'casino_f2', '借金の利子分のカジノチップを集める')],
    done: ['借用書が燃えた。…親父が笑って消えてったよ。'] },
  { n: '5a', t: '初めての勝ち', lv: 55, branch: 'a', from: 3, pre: '4a', last: true,
    offer: ['親父の分まで、一度だけ勝負する。ゴールドスライムの金の延べ棒を賭け金にするんだ！'],
    o: [K('slime_gold', 15, 'casino_f2', '地下金庫でゴールドスライムを倒す'), C('gold_bar', 2, 'casino_f2', '賭け金の金の延べ棒を集める')],
    done: ['…勝った。俺、勝ったよ！ 生まれて初めて！', '親父がいつも着けてたチェーンだ。俺の幸運は、あんたに預ける。'] },
  { n: '4b', t: 'ジャックポット台', lv: 53, branch: 'b', from: 3, pre: 3,
    offer: ['VIPフロアのジャックポット台は、ゴーストどもに占領されてる。'],
    o: [K('ghost_jackpot', 15, 'casino_f3', 'VIPフロアでジャックポット・ゴーストをどかす'), K('thug_vip', 10, 'casino_f3', 'VIPガードをどかす')],
    done: ['台が空いた！ 親父が…座った。'] },
  { n: '5b', t: '最後の一回', lv: 55, branch: 'b', from: 3, pre: '4b', last: true,
    offer: ['台を動かすには、ディーラーロボのカードが要る。頼む！'],
    o: [K('robot_dealer', 15, 'casino_f3', 'VIPフロアでディーラーロボを倒す'), C('casino_chip', 10, 'casino_f3', '台に入れるカジノチップを集める')],
    done: ['親父は…負けた。でも、笑ってたよ。「やっぱり勝負は楽しい」ってさ。', '負けても笑える男だった。…このチェーン、親父の形見だ。あんたに持っててほしい。'] },
]);

series('coco', { name: '幻のステージ', region: 'casino', npc: 'coco', qset: 'qset_coco_jacket' }, [
  { n: 1, t: '盗まれた衣装', lv: 48,
    offer: ['ショーガールのココよ！ 大変なの、今夜のショーの衣装が盗まれたの！', '砂漠ハイウェイのデザート・ライダーが持ってったって噂よ。'],
    o: [K('thug_desert', 15, 'casino_f1', '砂漠ハイウェイでデザート・ライダーを問い詰める（倒す）')],
    done: ['衣装はなかった…でも「金庫に運んだ」って言ってたのね？'] },
  { n: 2, t: '金庫の楽屋', lv: 51,
    offer: ['地下金庫ね…あそこ、昔は楽屋だったのよ。セキュリティドローンが邪魔するけど。'],
    o: [K('drone_casino', 15, 'casino_f2', '地下金庫でセキュリティドローンを落とす'), C('drone_chip', 6, 'casino_f2', '監視記録の入ったチップを集める')],
    done: ['ドローンの記録に…光る人影が衣装を持っていくのが映ってるわ。'] },
  { n: 3, t: '初代の看板スター', lv: 54,
    offer: ['光る人影…ネオン・パレスの初代看板スター「ジュエル」かもしれない。三十年前の火事で…。', 'クイーン・ダイヤさんなら何か知ってるはず。'],
    o: [T('job_diamond', 'casino', 'クイーン・ダイヤにジュエルのことを聞く')],
    done: ['ジュエルは、最後のショーをやり残したまま…。', 'ダイヤさんは「彼女はまだ舞台に立ちたいのよ」って。'] },
  { n: 4, t: 'VIPフロアの客席', lv: 56,
    offer: ['VIPフロアのジャックポット・ゴーストの中に、ジュエルがいるはず。会わせて！', 'VIPガードは…どかしてね。'],
    o: [K('thug_vip', 12, 'casino_f3', 'VIPフロアでVIPガードをどかす'), K('ghost_jackpot', 12, 'casino_f3', 'ジャックポット・ゴーストの中からジュエルを探す')],
    done: ['ジュエルと話せた。…一緒に舞台に立ってほしいって。私と！'] },
  { n: 5, t: '合同ステージ', lv: 58,
    offer: ['ショーの夜！ 照明を壊しにディーラーロボが来るって情報が。舞台を守って！'],
    o: [K('robot_dealer', 15, 'casino_f3', 'ディーラーロボから舞台を守る'), K('drone_casino', 10, 'casino_f3', '照明を狙うセキュリティドローンを落とす')],
    done: ['最高のショーだった…！ ジュエルは、最後のお辞儀をして消えたわ。', '客席の半分が幽霊だったけど、拍手は本物。このジャケット、あなたに着てほしい！'] },
]);

series('valet', { name: '人とロボのバレー勝負', region: 'casino', npc: 'ken_valet', qset: 'qset_valet_loafers' }, [
  { n: 1, t: 'ロボに負けた男', lv: 52,
    offer: ['ケンだ。ネオン・パレスの駐車係を二十年やってきた。…それが、ロボに仕事を取られた。', '夜景ブールバードのバレー・ロボがどれだけのもんか、確かめてくれ。'],
    o: [K('robot_valet', 12, 'casino_f4', '夜景ブールバードでバレー・ロボの腕前を確かめる（倒す）')],
    done: ['…速いな。だが、客の顔を覚えるのは俺の方が上だ。'] },
  { n: 2, t: '消えた高級車', lv: 54,
    offer: ['ロボが来てから、客の車がたまに消えるんだ。ダイヤスライムが車の宝石を食ってるって噂も…。'],
    o: [K('slime_diamond', 12, 'casino_f4', '夜景ブールバードでダイヤスライムを倒す'), C('casino_chip', 10, 'casino_f4', 'スライムが飲み込んだチップを回収する')],
    done: ['スライムの腹から車のキーが出てきた。ロボが預かったはずのキーだ。'] },
  { n: 3, t: '黒幕のディーラー', lv: 56,
    offer: ['バレー・ロボは、VIPフロアのディーラーロボの命令で動いてる。車を横流ししてるんだ！'],
    o: [K('robot_dealer', 12, 'casino_f3', 'VIPフロアでディーラーロボを倒す'), C('robot_gear', 8, 'casino_f3', '命令回路の歯車を集める')],
    done: ['横流しの証拠を掴んだ。これでロボは撤去だ。'] },
  { n: 4, t: '最後の勝負', lv: 58,
    offer: ['オーナーが言うんだ。「最後にロボと勝負して勝ったら、人を戻す」ってな。', 'ブールバードのロボを全部止めてくれ。俺は車を回す！'],
    o: [K('robot_valet', 20, 'casino_f4', '夜景ブールバードのバレー・ロボを止める'), K('ghost_neon', 10, 'casino_f4', '邪魔をするネオンゴーストを払う')],
    done: ['勝った…！ 駐車場に、人の声が戻ってきた。', 'このローファーは俺の勝負靴だ。あんたにやる。'] },
]);

series('bob', { name: '「キング」の秘密', region: 'casino', npc: 'king_bob', kind: 'joke' }, [
  { n: 1, t: 'キングのサングラス', lv: 42, items: ['cos_sideburn_shades'],
    offer: ['サンキュー、ベリーマッチ。ワタシは「キング」。ストリップ一のものまね芸人さ。', 'ステージ衣装のサングラスが、砂漠のガラガラヘビに盗まれた。取り返してくれるかい、ベイビー？'],
    o: [K('snake_rattle', 12, 'casino_f1', '砂漠ハイウェイでガラガラヘビからサングラスを取り返す')],
    done: ['サンキュー！ …あ、それはヘビの抜け殻だ。', 'サングラスは見つからなかったが、予備を君にあげよう。もみあげ付きさ。'] },
  { n: 2, t: '白いジャンプスーツ', lv: 46, items: ['cos_gold_jumpsuit'],
    offer: ['次の衣装はスパンコールの白いジャンプスーツ！', 'スロットロボの部品がスパンコールにぴったりなんだ。'],
    o: [K('robot_slot', 12, 'casino_f1', '砂漠ハイウェイでスロットロボを倒す'), C('robot_gear', 8, 'casino_f1', 'スパンコールにする歯車を集める')],
    done: ['完成だ、ベイビー！ 君の分も縫っておいたよ。'] },
  { n: 3, t: 'ギターがない', lv: 50, items: ['cos_ukulele'],
    offer: ['キングにはギターが必要だ。…でもギターは高い。', 'ゴールドスライムを倒せば、金が手に入るだろう？'],
    o: [K('slime_gold', 12, 'casino_f2', '地下金庫でゴールドスライムを倒す')],
    done: ['金は延べ棒ひとつ分も出なかった。…だからウクレレにした。君にもひとつ。'] },
  { n: 4, t: 'キングの正体', lv: 54, items: ['cos_manager_sash'],
    offer: ['今夜はついに大舞台…なんだが、夜勤のシフトとかぶってしまった。', '…夜勤？ 何でもない、ベイビー。とにかく夜の舞台を荒らすゴーストを追い払ってくれ！'],
    o: [K('ghost_neon', 15, 'casino_f4', '夜景ブールバードでネオンゴーストを追い払う'), K('ghost_after_hours', 5, 'casino_f4', 'アフターアワーズの客を追い払う（夜だけ出る）')],
    done: ['大成功だった！ …そして店にも間に合った。', '実はワタシ、コンビニ「ヴァイスマート」の店長なんだ。これはワタシのたすき。', '…キングの秘密は守ってくれよ、ベイビー。'] },
]);

series('chip', { name: '景品交換所の危機', region: 'casino', npc: 'mr_chip', prereq: ['m11_casino'], qset: 'qset_jackpot_wand' }, [
  { n: 1, t: '空っぽの景品棚', lv: 50,
    offer: ['いらっしゃい！ …と言いたいが、景品の在庫が空っぽだ。', '金庫のゴールドスライムから金を取り戻してくれ。景品の仕入れ代だ。'],
    o: [K('slime_gold', 12, 'casino_f2', '地下金庫でゴールドスライムを倒す'), C('gold_bar', 1, 'casino_f2', '金の延べ棒を取り戻す')],
    done: ['これで少しは仕入れられる。だが、誰が景品を…。'] },
  { n: 2, t: 'ダイヤの行方', lv: 53,
    offer: ['景品のダイヤが夜景ブールバードで見つかったって話だ。ダイヤスライムが食っちまったか。'],
    o: [K('slime_diamond', 15, 'casino_f4', '夜景ブールバードでダイヤスライムを倒す')],
    done: ['ダイヤは無かった。だが、スライムの体にカジノの刻印が…。'] },
  { n: 3, t: '金庫番の噂', lv: 56,
    offer: ['…ヴィヴィに聞いてくれ。金庫の景品が誰の手に渡ってるか、あの子なら知ってる。'],
    o: [T('vivi', 'casino', 'ヴィヴィに景品の行方を聞く')],
    done: ['メカ・ハイローラーが景品を溜め込んでた…？', '警備システムが「報酬」を学習しちまったのか！'] },
  { n: 4, t: 'ジャックポット', lv: 60,
    offer: ['メカ・ハイローラーをもう一度止めてくれ。腹の中の景品を取り戻すんだ！'],
    o: [B('boss_mecha', 'casino_f3', 'VIPフロアでメカ・ハイローラーを倒す')],
    done: ['景品が戻った！ 交換所、再開だ！', 'これは金庫の一番奥にあった秘蔵品。誰も交換できるだけのチップを持ってなかったんだが…あんたになら譲るよ。'] },
]);

// ============================================================ rooftop ヴァイス・タワー（Lv58〜76）
series('window', { name: '地上300mの職人', region: 'rooftop', npc: 'jo_window', qset: 'qset_window_helmet' }, [
  { n: 1, t: '揺れる足場', lv: 58,
    offer: ['窓拭き職人のジョーだ。地上300mでも平気だが…最近、足場が勝手に動くんだよ！', '工事現場の建設ロボが足場をいじってるらしい。'],
    o: [K('robot_worker', 15, 'tower_f1', '工事現場の足場で建設ロボを止める')],
    done: ['ロボを止めても、まだ足場が動いてる…。'] },
  { n: 2, t: '歩く鉄骨', lv: 61,
    offer: ['夜中に鉄骨が歩いてるのを見たんだ。スチールゴーレムってやつか！'],
    o: [K('golem_steel', 12, 'tower_f1', 'スチールゴーレムを倒す'), C('golem_core', 3, 'tower_f1', 'ゴーレムの核を集める')],
    done: ['ゴーレムの核に命令が書き込まれてる。「タワーを完成させよ」…？'] },
  { n: 3, t: '終わらない工事', lv: 63,
    offer: ['ドンが倒れても、ドンの工事プログラムが動き続けてるんだ。', 'ノヴァに核の解析を頼んでくれ。'],
    o: [T('nova', 'rooftop', 'ノヴァにゴーレムの核を見せる')],
    done: ['ノヴァによると、プログラムを止めるにはアサルトドローンの制御を全部落とすしかないって。'] },
  { n: 4, t: '最後の窓', lv: 66,
    offer: ['ドローンを止めてくれ。…そのあいだに俺は、ドンの部屋の窓を拭いてくる。', 'このタワーの、最後の窓だ。'],
    o: [K('drone_attack', 20, 'tower_f1', 'アサルトドローンを落とす'), K('robot_worker', 10, 'tower_f1', '残った建設ロボを止める')],
    done: ['工事が止まった。…ドンの窓は、思ったより小さかったよ。', '摩天楼の窓を全部拭いた職人にだけ贈られるヘルメットだ。あんたは窓より大きいものを磨いたからな。'] },
]);

series('ivy', { name: '空中庭園の再生', region: 'rooftop', npc: 'ivy', qset: 'qset_ivy_wings' }, [
  { n: 1, t: '枯れる庭園', lv: 62,
    offer: ['空中庭園の庭師、アイビーです。庭の木がどんどん枯れていくの。', 'ガーデンゴーレムが根を踏み荒らしてるみたい。'],
    o: [K('golem_garden', 12, 'tower_f2', '空中庭園でガーデンゴーレムを止める')],
    done: ['ゴーレムの足に…紫色の液体が付いてた。'] },
  { n: 2, t: '紫の胞子', lv: 65,
    offer: ['ミュータント・マッシュの胞子が紫色なの。庭を枯らしてるのはあれかも。'],
    o: [K('mushroom_mutant', 15, 'tower_f2', 'ミュータント・マッシュを刈る'), C('mushroom_cap', 10, 'tower_f2', '調べるためのかさを集める')],
    done: ['キノコの中に薬品の匂い…。ドンのペントハウスに研究所があったって噂、本当だったのね。'] },
  { n: 3, t: '研究所の跡', lv: 68,
    offer: ['研究所はペントハウスの奥。薬品の在りかを突き止めて。親衛隊の残党がいるわ。'],
    o: [R('tower_f3', '最上階ペントハウスへ行く'), K('thug_elite', 12, 'tower_f3', 'ドン親衛隊の残党を退ける')],
    done: ['薬品の名前は「ネオン肥料」…ドンは庭の木を光らせたかっただけ？'] },
  { n: 4, t: 'スナイパーの見張り', lv: 70,
    offer: ['薬品の樽は、空中庭園の傭兵スナイパーが見張ってる。', '樽を取り返して、中和剤を作るわ。'],
    o: [K('thug_merc', 15, 'tower_f2', '空中庭園で傭兵スナイパーを退ける')],
    done: ['中和剤ができた。あとは庭に撒くだけ。'] },
  { n: 5, t: '最初の一本', lv: 72,
    offer: ['中和剤を撒くあいだ、ドローンとゴーレムから庭を守って！'],
    o: [K('drone_attack', 15, 'tower_f2', 'アサルトドローンから庭を守る'), K('golem_garden', 15, 'tower_f2', 'ガーデンゴーレムから庭を守る')],
    done: ['見て…最初の一本の木に、新しい葉が！', 'その葉で翼を編んだの。屋上の風を、あなたに。'] },
]);

series('rook', { name: '兄弟の銃', region: 'rooftop', npc: 'rook', qset: 'qset_rook_pistol' }, [
  { n: 1, t: '元傭兵の頼み', lv: 66,
    offer: ['…ルークだ。昔は傭兵をやってた。今はこのビルの管理人だ。', '頼みがある。空中庭園の傭兵スナイパーの中に、俺の弟がいるかもしれない。'],
    o: [K('thug_merc', 12, 'tower_f2', '空中庭園で傭兵スナイパーを調べる（倒す）')],
    done: ['弟はいなかったか。…だが、スナイパーの一人が弟のスコープを持ってた。'] },
  { n: 2, t: 'スコープの記録', lv: 68,
    offer: ['スコープに記録が残ってる。アサルトドローンの通信データと照合したい。'],
    o: [K('drone_attack', 15, 'tower_f2', 'アサルトドローンを落とす'), C('drone_chip', 8, 'tower_f2', '通信データの入ったチップを集める')],
    done: ['弟のジェイは…ドン親衛隊に引き抜かれていた。'] },
  { n: 3, t: '親衛隊の弟', lv: 71,
    offer: ['ペントハウスに行く。ジェイは、ドンがいなくなっても、まだあそこを守ってる。'],
    o: [K('thug_elite', 15, 'tower_f3', '最上階ペントハウスでドン親衛隊を退ける')],
    done: ['…どうする？'],
    choice: { prompt: '親衛隊の中に、ルークと同じ目をした青年がいた。ジェイは銃を構えたまま言う。「兄貴、帰れ。ここが俺の居場所だ」',
      a: { tag: 'talk', text: 'ジェイを言葉で説得する', dialog: ['…話をさせてくれ。銃じゃなくて、言葉で。', '昔、一緒に撃ち方を覚えた屋上の話からだ。'] },
      b: { tag: 'fight', text: 'ジェイと戦って目を覚まさせる', dialog: ['…あいつは、撃ち合わないとわからない。俺がそうだった。', '手を貸してくれ。殺さずに、膝をつかせる。'] } } },
  { n: '4a', t: '屋上の写真', lv: 72, branch: 'a', from: 3, pre: 3,
    offer: ['ジェイと子どもの頃に遊んだ屋上の写真がある。ノヴァがデータを持ってるはずだ。', 'ペントハウスへの道は、ゴールドゴーレムがふさいでる。'],
    o: [T('nova', 'rooftop', 'ノヴァに古い写真のデータをもらう'), K('golem_gold', 10, 'tower_f3', '道をふさぐゴールドゴーレムをどかす')],
    done: ['写真を見せたら、ジェイの銃口が下がった。'] },
  { n: '5a', t: '二人の屋上', lv: 76, branch: 'a', from: 3, pre: '4a', last: true,
    offer: ['ジェイが親衛隊を抜けると言ったら、残りの連中が襲ってきた。守ってくれ！'],
    o: [K('thug_elite', 20, 'tower_f3', 'ドン親衛隊を退ける'), K('drone_guardian', 12, 'tower_f3', 'ガーディアンドローンを落とす')],
    done: ['ジェイは屋上に戻ってきた。…ガキの頃と同じ場所に座ってる。', '俺たちの銃を一丁にまとめた。二度と撃ち合わないように。あんたが持っててくれ。'] },
  { n: '4b', t: '一対一の作法', lv: 72, branch: 'b', from: 3, pre: 3,
    offer: ['ジェイの護衛ドローンを先に落とす。一対一にするんだ。'],
    o: [K('drone_guardian', 15, 'tower_f3', 'ガーディアンドローンを落とす')],
    done: ['護衛はいない。あとはジェイだけだ。'] },
  { n: '5b', t: '膝をつかせろ', lv: 76, branch: 'b', from: 3, pre: '4b', last: true,
    offer: ['ジェイはゴールドゴーレムの影に陣取ってる。ゴーレムを崩して、引きずり出せ！'],
    o: [K('golem_gold', 15, 'tower_f3', 'ゴールドゴーレムを崩す'), K('thug_elite', 15, 'tower_f3', 'ジェイの仲間の親衛隊を退ける')],
    done: ['…ジェイが銃を置いた。「兄貴には、やっぱり勝てねえ」だとさ。', '撃ち合いはこれで終わりだ。二人の銃を一丁にした。あんたが持っててくれ。'] },
]);

series('yui', { name: 'バズりたいユイ', region: 'rooftop', npc: 'yui', kind: 'joke' }, [
  { n: 1, t: 'スリル映え', lv: 58, items: ['cos_pink_jersey'],
    offer: ['はじめまして〜！ NeonGramフォロワー3人のユイです☆', '工事現場の足場で「スリル映え」撮りたいの！ ロボが邪魔だから、どかしてくれる？'],
    o: [K('robot_worker', 12, 'tower_f1', '工事現場の足場で建設ロボをどかす')],
    done: ['撮れた〜！ …フォロワー、3人のまま。衣装が地味だったかな。', 'これ、あげる！ 蛍光ピンク！'] },
  { n: 2, t: '上下で映える', lv: 62, items: ['cos_pink_jersey_pants'],
    offer: ['ジャージは上下で着ないと映えないって気づいたの！', '次は鉄骨バックで撮りたいから、スチールゴーレムをどかして！'],
    o: [K('golem_steel', 10, 'tower_f1', 'スチールゴーレムをどかす')],
    done: ['上下ピンク！ フォロワー、4人になった！ あなたの分もあるよ☆'] },
  { n: 3, t: '天使ショット', lv: 66, items: ['cos_donut_halo'],
    offer: ['空中庭園で天使っぽい写真を撮りたいの！ 光の輪の小道具はドーナツで作るから、キノコを片付けて！'],
    o: [K('mushroom_mutant', 12, 'tower_f2', '空中庭園のミュータント・マッシュを片付ける')],
    done: ['天使ショット、完成〜！ 撮影後、ドーナツはおいしくいただきました。', 'あ、もう一個あるよ！'] },
  { n: 4, t: 'バズる夜', lv: 72, items: ['cos_selfie_stick'],
    offer: ['最後は最上階ペントハウスで夜景自撮り！ 親衛隊とゴーレムを…お願い！'],
    o: [K('thug_elite', 10, 'tower_f3', 'ドン親衛隊をどかす'), K('golem_gold', 8, 'tower_f3', 'ゴールドゴーレムをどかす')],
    done: ['バズった〜！！ …写ってたの、後ろで戦ってるあなただったけど！ フォロワー1万人！', 'これ、私の相棒の自撮り棒。あなたにあげる！ 次はあなたが映えてね☆'] },
]);

// ============================================================ spaceport ルミナ宇宙港（Lv36〜100）
series('cadet', { name: '星のワッペン', region: 'spaceport', npc: 'pip', prereq: ['sp01_spaceport'], qset: 'qset_cadet_jersey' }, [
  { n: 1, t: '落ちこぼれ訓練生', lv: 37,
    offer: ['ぼく、ピップ！ ルミナ宇宙港のパイロット訓練生…試験に三回落ちてるけど。', '実技の練習相手がほしいんだ。沿岸のパトロールボットで！'],
    o: [K('robot_patrol', 12, 'space_f1', '沿岸ロケット道でパトロールボットと模擬戦をする')],
    done: ['すごい！ 君の動き、教科書より正確だ！'] },
  { n: 2, t: '空中戦の訓練', lv: 39,
    offer: ['次は空中戦。ジェットカモメはロケットより速いんだって！'],
    o: [K('seagull_jet', 12, 'space_f1', 'ジェットカモメと空中戦をする'), C('seagull_feather', 6, 'space_f1', '翼の研究用にカモメの羽を集める')],
    done: ['羽の形、翼の設計に使えそう！ メモメモ…。'] },
  { n: 3, t: '教官の秘密', lv: 42,
    offer: ['試験官のエース教官、ぼくにだけ厳しいんだ。…なんでか聞いてきてくれない？'],
    o: [T('ace_jet', 'spaceport', 'エース・ジェットに話を聞く')],
    done: ['え…ぼくの父さんとエース教官が、昔のバディだった？', '父さんは試験飛行の事故で…。だから、ぼくにだけ厳しいんだ。'] },
  { n: 4, t: '発射台の試験', lv: 45,
    offer: ['最後の実技試験は発射台エリア。発射管制ドローンをかいくぐって、搬入ロボを止めるんだ！'],
    o: [K('drone_launch', 12, 'space_f2', '発射台エリアで発射管制ドローンを落とす'), K('robot_loader', 12, 'space_f2', '搬入ロボを止める')],
    done: ['実技は通過…！ でも、最後の口頭試問が残ってる。'] },
  { n: 5, t: '星のワッペン', lv: 48,
    offer: ['口頭試問の前に、燃料スライムが発射台にあふれちゃって！ それにグレイまで！', '片付けないと試験が始まらない！'],
    o: [K('slime_fuel', 15, 'space_f2', 'ロケット燃料スライムを片付ける'), K('alien_grey', 8, 'space_f2', 'グレイを追い払う')],
    done: ['合格だ！ エース教官が「お前の父さんより筋がいい」って…！', '合格した訓練生だけが着られるジャージ、予備をもらったんだ。君にも着てほしい！'] },
]);

series('spacefood', { name: 'うまい宇宙食', region: 'spaceport', npc: 'chef_orbit', prereq: ['sp01_spaceport'], qset: 'qset_orbit_cargo' }, [
  { n: 1, t: 'コリコリ食感', lv: 38,
    offer: ['宇宙食シェフのオービットだ。宇宙食は「まずい」と言われ続けて二十年…今度こそ、うまい新メニューを作る！', '食材はコーストクラゲ。コリコリ食感がいけるはずだ！'],
    o: [K('jelly_coast', 12, 'space_f1', '沿岸ロケット道でコーストクラゲを獲る'), C('jelly_tentacle', 8, 'space_f1', 'クラゲの触手を集める')],
    done: ['…しびれる。舌が。でも新しい！'] },
  { n: 2, t: '厨房の泥棒', lv: 42,
    offer: ['搬入ロボが厨房の食材を勝手に運び出してるんだ。止めてくれ！'],
    o: [K('robot_loader', 12, 'space_f2', '発射台エリアで搬入ロボを止める'), C('robot_gear', 6, 'space_f2', '盗まれた食材の目印（歯車）を集める')],
    done: ['厨房に平和が戻った。'] },
  { n: 3, t: '禁断の食材', lv: 46,
    offer: ['…実は試してみたい食材がある。ロケット燃料スライムだ。', '誰にも言うなよ？ ステラ博士には特にな。'],
    o: [K('slime_fuel', 15, 'space_f2', 'ロケット燃料スライムを獲る'), C('slime_jelly', 8, 'space_f2', '燃料ゼリーを集める')],
    done: ['…うまい。信じられないほどうまい！ 燃料なのに！'] },
  { n: 4, t: '試食会', lv: 50,
    offer: ['試食会を開く！ ステラ博士とエースに招待状を届けてくれ。', '会場の発射台はグレイがうろついてるから、追い払っといてくれ！'],
    o: [T('dr_stella', 'spaceport', 'ステラ博士に招待状を届ける'), T('ace_jet', 'spaceport', 'エース・ジェットに招待状を届ける'), K('alien_grey', 10, 'space_f2', '会場のグレイを追い払う')],
    done: ['大好評だった！ 博士は燃料スライムと聞いて気絶したが、目を覚ましておかわりした。', 'このカーゴ、ポケットに宇宙食が12種類入る。持っていけ！'] },
]);

series('ufo', { name: 'UFOを呼ぶ男', region: 'spaceport', npc: 'tanaka', kind: 'joke', prereq: ['sp01_spaceport'] }, [
  { n: 1, t: '思念波対策', lv: 40, items: ['cos_tinfoil_hat'],
    offer: ['ようこそ、ギャラクシー田中の観測所へ！ 私はUFOを呼ぶ男です。', 'まずはこれをかぶって。宇宙人の思念波から脳を守るアルミの帽子です。', 'かぶったら、沿岸のジェットカモメを追い払ってください。UFOと見間違えるので。'],
    o: [K('seagull_jet', 10, 'space_f1', '沿岸ロケット道でジェットカモメを追い払う')],
    done: ['カモメでした。全部カモメでした。…帽子は差し上げます。'] },
  { n: 2, t: '電波を受信せよ', lv: 44, items: ['cos_antenna_headphones'],
    offer: ['自作の受信機が完成しました！ アンテナの材料に、発射管制ドローンの部品が要ります。'],
    o: [K('drone_launch', 12, 'space_f2', '発射台エリアで発射管制ドローンを落とす'), C('drone_chip', 6, 'space_f2', 'アンテナにするチップを集める')],
    done: ['受信できました！ …演歌です。「ルミナ港ブルース」。', 'あなたにも一つ差し上げます。'] },
  { n: 3, t: 'お供え物', lv: 48, items: ['cos_frozen_tuna'],
    offer: ['宇宙人は絶対マグロが好きです。発射台のグレイにお供えしたいので、まず道を開けてください。'],
    o: [K('alien_grey', 12, 'space_f2', '発射台エリアでグレイの前に立つ（倒す）')],
    done: ['グレイはマグロを見て、とても困った顔をしたそうです。', '…あなたが持っていてください。冷凍です。'] },
  { n: 4, t: 'お面で友好', lv: 78, items: ['cos_alien_mask'],
    offer: ['月面区画にムーン・エイリアンが出たそうですね！ 友好の印に、このお面をつけて会ってきてください！', '…たぶん、攻撃されると思いますが。'],
    o: [K('alien_moon', 12, 'space_f3', '月面シミュ区画でムーン・エイリアンに会う（倒す）')],
    done: ['怒られた？ 「似てない」と？ …そうですか。', 'お面はお返しします。いえ、差し上げます。'] },
  { n: 5, t: 'UFO、来たる', lv: 85, items: ['cos_ufo_halo'],
    offer: ['ついに完成しました。手作りUFOです！ フライパン二枚です！', '謎の宇宙船の宇宙人たちに見せて、仲間だと思ってもらいましょう！'],
    o: [K('alien_warrior', 10, 'space_f4', '謎の宇宙船でエイリアン戦士にUFOを見せる（倒す）'), K('jelly_void', 8, 'space_f4', 'ヴォイドクラゲにもUFOを見せる（倒す）')],
    done: ['「惜しい」と言われた？ …惜しい！ 惜しいということは、ほぼ正解です！！', '田中の研究は続きます。このUFOは、最初の同志であるあなたに。'] },
]);

series('moonecho', { name: '月からの声', region: 'spaceport', npc: 'ace_jet', prereq: ['sp04_moon'], qset: 'qset_moon_helmet' }, [
  { n: 1, t: '区画からの声', lv: 78,
    offer: ['月面区画の通信機に、毎晩同じ声が入るんだ。「おかえり」って。', '区画の奥を調べてくれ。ルナローバーが通信を中継してるかもしれない。'],
    o: [K('robot_lunar', 12, 'space_f3', '月面シミュ区画でルナローバーを調べる（倒す）'), C('robot_gear', 6, 'space_f3', '通信ログの入った歯車を集める')],
    done: ['ローバーのログに、知らない周波数が記録されてる。'] },
  { n: 2, t: '月の石の秘密', lv: 81,
    offer: ['周波数は月の石から出てる。…あれは本物の月の石だったよな。'],
    o: [K('golem_moon', 10, 'space_f3', 'ムーンゴーレムを倒す'), C('moon_rock', 5, 'space_f3', '月の石を集める')],
    done: ['石の中に、古い通信記録が…。'] },
  { n: 3, t: '博士の解析', lv: 83,
    offer: ['ステラ博士に月の石を見せて、解析を頼んでくれ。'],
    o: [T('dr_stella', 'spaceport', 'ステラ博士に月の石の解析を頼む')],
    done: ['博士が言うには、この区画は「本物の月の一部」を切り取って作られたらしい。', 'ゾグの船が運んできたんだ。…声の主も、一緒に。'] },
  { n: 4, t: 'コズミック・ノイズ', lv: 86,
    offer: ['声の発信源は区画の一番奥。コズミッククラゲとムーン・エイリアンが電波を乱してる。片付けてくれ。'],
    o: [K('jelly_cosmic', 15, 'space_f3', 'コズミッククラゲを倒す'), K('alien_moon', 12, 'space_f3', 'ムーン・エイリアンを倒す')],
    done: ['声がはっきり聞こえた。…「おかえり」は、月に取り残された誰かの、帰りを待つ声だった。'] },
  { n: 5, t: '月への返事', lv: 90,
    offer: ['返事をしたいんだ。宇宙船の通信機を使えば、月まで届く。', '宇宙船に行って、通信機の前のゼノメカとアストラル体をどかしてくれ。'],
    o: [K('robot_xeno', 12, 'space_f4', '謎の宇宙船でゼノメカをどかす'), K('ghost_astral', 8, 'space_f4', 'アストラル体をどかす')],
    done: ['返事を送った。「ただいま」って。…数分後、月から光が一回だけ瞬いたよ。', 'このヘルメットで、ときどき月の声が聞こえる。あんたが持っててくれ。'] },
]);

// ============================================================ 地域をまたぐ大きな連作
series('legend', { name: '街の伝説「ネオン・フェニックス」', region: 'cross', npc: 'lyra', kind: 'cross', qset: 'qset_phoenix_wings', flags: ['title_phoenix'] }, [
  { n: 1, t: '不死鳥の歌', lv: 15,
    offer: ['旅の語り部、リラです。私は、この街の伝説を追っているの。', '「街が闇に沈むとき、ネオンの不死鳥が夜を焼き払う」…最初の手がかりは、灯台守のガスさんが知ってるはず。'],
    o: [T('old_gus', 'beach', 'ガスじいさんに伝説を聞く'), K('flamingo', 10, 'beach_f4', 'ハイウェイ入口で暴れるヤンキーフラミンゴを鎮める')],
    done: ['「不死鳥の羽は、街で最初のネオン看板に宿った」…ダウンタウンね！'] },
  { n: 2, t: '最初の看板', lv: 20,
    offer: ['ダウンタウンのガレージのダッシュさんが、古い看板を直してるって聞いたわ。'],
    o: [T('dash_garage', 'downtown', 'ダッシュに古い看板のことを聞く'), K('rat_neon', 12, 'down_f3', '高架ハイウェイでネオンラットを倒す')],
    done: ['看板の裏に、羽の模様が刻まれてたって！ 次の手がかりは「港の霧」…。'] },
  { n: 3, t: '港の霧の中で', lv: 30,
    offer: ['ポート・スラムのモリ船長が、霧の中で燃える鳥を見たんですって。'],
    o: [T('old_mori', 'slums', 'モリ船長に燃える鳥の話を聞く'), K('thug_smuggler', 12, 'slums_f3', '密輸船の船員を退ける')],
    done: ['鳥は沼の方へ飛んでいった…グレイズ村ね。'] },
  { n: 4, t: '沼の古老', lv: 42,
    offer: ['ブーンじいさんは、子どもの頃に不死鳥を見たんですって。'],
    o: [T('old_boone', 'swamp', 'ブーンじいさんに不死鳥の話を聞く'), K('gator_fog', 12, 'swamp_f4', '霧の水路のミスト・ゲイターを退ける')],
    done: ['不死鳥は沼で傷を癒して、黄金の街へ…カジノ街ね！'] },
  { n: 5, t: '黄金の籠', lv: 55,
    offer: ['ミスター・チップの景品台帳に、「燃える羽一枚」という記録があるらしいの。'],
    o: [T('mr_chip', 'casino', 'ミスター・チップに景品台帳を見せてもらう'), K('ghost_jackpot', 12, 'casino_f3', 'VIPフロアのジャックポット・ゴーストを退ける')],
    done: ['羽はドンが買い取って、摩天楼の最上階に…。'] },
  { n: 6, t: '摩天楼の頂', lv: 68,
    offer: ['ノヴァさんなら、ペントハウスの金庫の記録を調べられるはず。'],
    o: [T('nova', 'rooftop', 'ノヴァに金庫の記録を調べてもらう'), K('thug_merc', 15, 'tower_f2', '空中庭園の傭兵スナイパーを退ける')],
    done: ['金庫の羽は…ドンの手で、街のネオンの「燃料」にされていた。', 'この街のネオンは、全部不死鳥の羽から…。'] },
  { n: 7, t: '夜明けの不死鳥', lv: 75,
    offer: ['羽を取り戻せば、不死鳥はよみがえる。…最上階のペントハウスへ！'],
    o: [K('thug_elite', 20, 'tower_f3', 'ペントハウスのドン親衛隊を退ける'), K('drone_guardian', 15, 'tower_f3', '金庫を守るガーディアンドローンを落とす')],
    done: ['…見て。屋上の空に、ネオンの翼が。', '伝説は本当だった。そしてその伝説を取り戻したのは、あなた。', 'この翼は、不死鳥があなたに残していったもの。あなたのことを歌にして、ずっと語り継ぐわ。'] },
]);

series('record', { name: '失われたレコード', region: 'cross', npc: 'barney', kind: 'cross', qset: 'qset_vice_night_guitar' }, [
  { n: 1, t: '幻の一枚', lv: 22,
    offer: ['いらっしゃい、レコード屋バーニーだ。…伝説のレコード「ヴァイス・ナイト」を知ってるか？', 'この街で一枚だけプレスされた幻の盤さ。その欠片が倉庫街で見つかったんだ。'],
    o: [K('thug_dockhand', 15, 'slums_f1', '倉庫街で港のゴロツキから欠片を取り返す'), C('stolen_vinyl', 6, 'slums_f1', 'レコードを集めて欠片を探す')],
    done: ['盤の欠片だ！ 本物だ…。'] },
  { n: 2, t: 'ハイウェイの音', lv: 24,
    offer: ['DJパルスの話じゃ、ヴァイス・ナイトはハイウェイを走りながら聴く曲だったらしい。', 'ライダーどもが欠片をお守りにしてるかもな。'],
    o: [K('thug_biker', 15, 'down_f3', '高架ハイウェイでハイウェイ・ライダーを倒す'), C('street_tag', 8, 'down_f3', '欠片が縫い込まれたワッペンを集める')],
    done: ['ワッペンの裏に…レコードの欠片が縫い込まれてた！'] },
  { n: 3, t: '沼のブルース', lv: 32,
    offer: ['三枚目の欠片は、沼の地下闘技場の胴元が持ってる。クロック・ジョーだ。'],
    o: [T('job_croc', 'swamp', 'クロック・ジョーと話す'), K('snake_mangrove', 12, 'swamp_f2', 'マングローブ迷路のボアを退ける')],
    done: ['ジョーは欠片を「闘技場の入場曲」の盤にしてたらしい。返してくれたよ。'] },
  { n: 4, t: 'カジノの金庫', lv: 50,
    offer: ['最後の欠片は、ドンがカジノの金庫にしまい込んだ。…チップの亡霊が守ってる。'],
    o: [K('ghost_chip', 15, 'casino_f2', '地下金庫でチップの亡霊を退ける'), C('ghost_wisp', 6, 'casino_f2', '欠片を包む亡霊のゆらめきを集める')],
    done: ['…揃った。どうする？'],
    choice: { prompt: '欠片が全部そろい、ヴァイス・ナイトが元に戻った。バーニーが言う。「このレコード、どうしたい？」',
      a: { tag: 'rave', text: 'DJパルスに渡し、レイブで流してもらう', dialog: ['いいね。レコードは聴かれてこそだ。', 'パルスに届けよう。'] },
      b: { tag: 'shop', text: '店に飾って、街の宝として守る', dialog: ['…そうだな。一枚しかない盤だ。誰かが守らなきゃならない。', 'ガラスケースを用意するよ。'] } } },
  { n: '5a', t: 'レイブの夜', lv: 52, branch: 'a', from: 4, pre: 4,
    offer: ['パルスのレイブでヴァイス・ナイトをかける！ 当日、密輸船の連中が電源を狙ってるらしい。'],
    o: [T('dj_pulse', 'slums', 'DJパルスにレコードを届ける'), K('thug_smuggler', 15, 'slums_f3', '密輸船の船員を止める')],
    done: ['フロアが揺れた。…ヴァイス・ナイトは、三十年ぶりに街に鳴り響いた。'] },
  { n: '5b', t: 'ガラスケース', lv: 52, branch: 'b', from: 4, pre: 4,
    offer: ['ケースの鍵の材料に、カジノのチップが要るんだ。それと…店を狙う泥棒にも気をつけないと。'],
    o: [C('casino_chip', 15, 'casino_f2', '鍵の材料のカジノチップを集める'), K('thug_bouncer', 15, 'casino_f2', 'レコードを狙う用心棒を退ける')],
    done: ['ヴァイス・ナイトは、店のガラスケースの中で静かに光ってる。'] },
  { n: 6, t: '作曲者', lv: 60, pre: [], preAny: ['5a', '5b'], last: true,
    offer: ['一人の老人が店に来た。「あの曲を書いたのは私だ」って。…ヴィヴィの祖父だったんだ。', 'カジノまで会いに行ってくれ。'],
    dbf: {
      qc_record_rave: { offer: ['レイブの夜のあと、一人の老人が店に来た。「あの曲を書いたのは私だ」って。', '…ヴィヴィの祖父だったんだ。カジノまで会いに行ってくれ。'],
        done: ['ヴィヴィの祖父は、もう一度だけギターを弾いた。レイブで聴いた若者たちの前でな。', 'そのギターを、あんたに託すってさ。'] },
      qc_record_shop: { offer: ['ケースの前で、ずっと泣いてる老人がいた。「あの曲を書いたのは私だ」って。', '…ヴィヴィの祖父だったんだ。カジノまで会いに行ってくれ。'],
        done: ['ヴィヴィの祖父は、店のケースの前でギターを弾いた。三十年ぶりのヴァイス・ナイトだ。', 'そのギターを、あんたに託すってさ。'] },
    },
    o: [T('vivi', 'casino', 'ヴィヴィに祖父の話を伝える'), K('robot_dealer', 12, 'casino_f3', '祖父のギターを囲むディーラーロボをどかす')],
    done: ['ヴィヴィの祖父は、三十年ぶりにヴァイス・ナイトを弾いた。', 'そのギターを、あんたに託すってさ。'] },
]);

series('phantom', { name: 'ネオン怪盗団', region: 'cross', npc: 'hound', kind: 'cross', qset: 'qset_phantom_boots' }, [
  { n: 1, t: '予告状', lv: 30,
    offer: ['探偵のハウンドだ。…ネオン怪盗団を知っているか？ 予告状を出しては、宝を盗んでいく連中だ。', '最初の予告状は港の密輸船。「船長の宝をいただく」。先回りしてくれ。'],
    o: [R('slums_f3', '密輸船へ先回りする'), K('thug_smuggler', 12, 'slums_f3', '密輸船の船員を退ける')],
    done: ['…もう盗まれていた。現場に残っていたのは、ピンクのネコの足跡のカードだ。'] },
  { n: 2, t: 'ピンクの足跡', lv: 36,
    offer: ['カードの紙は、ダウンタウンのブティックの包装紙と同じだ。店員に話を聞いてくれ。', '公園のスケーターが怪しい人影を見たとも聞く。'],
    o: [T('shop_downtown', 'downtown', 'ブティックのミミに話を聞く'), K('thug_skater', 15, 'down_f4', 'セントラル公園のスケボー・チンピラに聞き込む（倒す）')],
    done: ['ミミは何も知らないと言った…が、カウンターの下にピンクの手袋があった、と。'] },
  { n: 3, t: '沼の宝石', lv: 42,
    offer: ['第二の予告状。「沼の主の涙をいただく」…アルビノの鱗のことか！'],
    o: [K('gator_albino', 10, 'swamp_f3', 'ワニの巣でアルビノゲイターを見張る（倒す）'), C('gator_scale', 2, 'swamp_f3', 'アルビノの鱗を先に確保する')],
    done: ['鱗は守れた。だが怪盗は、代わりに村の子どもに菓子を置いていった。…妙な泥棒だ。'] },
  { n: 4, t: 'カジノ大作戦', lv: 52,
    offer: ['第三の予告状。「ネオン・パレスの金庫の涙をいただく」。今度こそ捕まえる！'],
    o: [K('drone_casino', 15, 'casino_f2', '地下金庫のセキュリティドローンを止める（怪盗の逃げ道をふさぐ）'), K('thug_bouncer', 12, 'casino_f2', '騒ぎに乗じる用心棒を退ける')],
    done: ['取り逃がした…。だが、監視映像に映った怪盗の顔は…ブティックのミミだ。'] },
  { n: 5, t: '盗品の行方', lv: 58,
    offer: ['ミミを問い詰める前に証拠だ。夜景ブールバードで、怪盗団の手下が盗品を運んでいるらしい。'],
    o: [K('ghost_neon', 12, 'casino_f4', '夜景ブールバードのネオンゴーストを退ける'), K('slime_diamond', 12, 'casino_f4', '盗品を飲み込んだダイヤスライムを倒す')],
    done: ['盗品は…全部、ドンが街の人から奪った物だった。', '怪盗団は、それを持ち主に返していたんだ。'] },
  { n: 6, t: '最後の予告状', lv: 64,
    offer: ['最後の予告状。「摩天楼の頂から、街の夜をいただく」。…ミミは屋上だ。'],
    o: [K('robot_worker', 15, 'tower_f1', '工事現場の足場の建設ロボを止める'), K('golem_steel', 12, 'tower_f1', 'スチールゴーレムを退けて屋上へ急ぐ')],
    done: ['…どうする。'],
    choice: { prompt: '屋上でミミが振り返る。「この街の夜は、ドンのものでも、あたしのものでもない。…返すだけよ」。ハウンドは手錠を握っている。',
      a: { tag: 'free', text: '見逃す（怪盗団の義賊ぶりを認める）', flags: ['title_phantom_free'], dialog: ['…探偵が泥棒を見逃すなんてな。', '今夜だけだ。…今夜だけだぞ。'] },
      b: { tag: 'arrest', text: '捕まえる（法は法だ）', flags: ['title_phantom_arrest'], dialog: ['…すまないな、ミミ。法は法だ。', 'だが、盗品の持ち主たちの名前は、全部調書に書いておく。'] } } },
  { n: '7a', t: '怪盗の夜', lv: 70, branch: 'a', from: 6, pre: 6, last: true,
    offer: ['ミミが最後の仕事を手伝ってほしいと言っている。…ペントハウスに残る盗品を、街に返す仕事だ。'],
    o: [K('thug_elite', 15, 'tower_f3', 'ペントハウスのドン親衛隊を退ける'), K('golem_gold', 10, 'tower_f3', '金庫を守るゴールドゴーレムを崩す')],
    done: ['盗品は全部、持ち主の元へ。…翌朝、ブティックは何事もなかったように開いていた。', 'ミミからだ。「共犯者へ」って。足音のしないブーツさ。'] },
  { n: '7b', t: '調書の最後の一行', lv: 70, branch: 'b', from: 6, pre: 6, last: true,
    offer: ['ミミは連行された。だが、怪盗団の残りが仲間を取り返しに来る。…連中の隠れ家はペントハウスだ。'],
    o: [K('thug_elite', 15, 'tower_f3', 'ペントハウスのドン親衛隊を退ける'), K('drone_guardian', 10, 'tower_f3', 'ガーディアンドローンを落とす')],
    done: ['怪盗団は解散した。盗品は持ち主に返され、ミミの刑は…街の嘆願で、ずいぶん軽くなったらしい。', '押収品の中にあったブーツだ。署で預かるより、あんたが履いた方がいい。'] },
]);

// ============================================================ 地域の連作を全部終えた記念（称号つき）
const REGION_MEMENTO = {
  beach: { giver: 'rico', lv: 12, talk: ['sunny', 'mel'], name: 'ビーチの人気者', item: 'qset_memento_beach',
    offer: ['よう。ビーチの連中が、みんなお前の話をしてるぜ。', 'サニーとメルが、お礼を言いたいってよ。顔を出してやれ。'],
    dbf: { qc_sandcastle_peace: { offer: ['よう。ヤドカリ団地、観光名所になってるぜ。お前のおかげだな。', 'サニーとメルが、お礼を言いたいってよ。顔を出してやれ。'] },
      qc_sandcastle_war: { offer: ['よう。桟橋がすっかり静かになったな。…ヤドカリどもは隣の浜に引っ越したらしい。', 'サニーとメルが、お礼を言いたいってよ。顔を出してやれ。'] } },
    done: ['ビーチの連中みんなで金を出し合って、スカーフを作ったんだ。', 'お前はもう、ここの人気者だ。…最初に会ったときは一文無しだったのにな。'] },
  downtown: { giver: 'mama_rosa', lv: 22, talk: ['mika', 'dash_garage'], name: 'ダウンタウンの顔', item: 'qset_memento_downtown',
    offer: ['あんた、ダウンタウンじゅうの困りごとを片付けちまったんだって？', '記者のミカと、ガレージのダッシュがあんたを待ってるよ。'],
    dbf: { qc_scoop_publish: { offer: ['朝刊、読んだよ。あんたが真実を書かせたんだってね。', '記者のミカと、ガレージのダッシュがあんたを待ってるよ。'] },
      qc_scoop_deal: { offer: ['ミカから聞いたよ。記事を伏せて、もっと大きな悪を追ってるんだってね。', '記者のミカと、ガレージのダッシュがあんたを待ってるよ。'] } },
    done: ['店主たちで金を出し合って作ったチェーンさ。小さな看板付きだよ。', 'あんたはもう、この街の顔さ。'] },
  slums: { giver: 'tank', lv: 36, talk: ['old_mori', 'rina'], name: '港の頼れる奴', item: 'qset_memento_slums',
    offer: ['港の連中から、お前の名前ばっかり聞くぜ。', 'モリ船長と、うちのリナが礼を言いたいってよ。'],
    dbf: { qc_ghostship_forgive: { offer: ['ハーケンが船長に戻ったらしいな。モリのじいさん、毎日港で船を見てるぜ。', 'モリ船長と、うちのリナが礼を言いたいってよ。'] },
      qc_ghostship_judge: { offer: ['密輸船が差し押さえられて、港は静かになった。…モリのじいさんは寂しそうだがな。', 'モリ船長と、うちのリナが礼を言いたいってよ。'] } },
    done: ['港の古い錨の鎖を磨いて作った。お前は港で一番頼れる奴だ。'] },
  swamp: { giver: 'old_boone', lv: 45, talk: ['sue', 'voodoo_betty'], name: 'グレイズの守り人', item: 'qset_memento_swamp',
    offer: ['村の者がみんな、お前さんに礼を言いたがっとる。', 'スーとベティのところへ顔を出してやってくれ。'],
    dbf: { qc_voodoo_rest: { offer: ['…故郷の灯を見送れた。お前さんのおかげじゃ。', 'スーとベティのところへ顔を出してやってくれ。'] },
      qc_voodoo_brew: { offer: ['村のまわりの青い守り火…あれは、わしの故郷の者たちじゃろう。守ってくれておるんじゃな。', 'スーとベティのところへ顔を出してやってくれ。'] } },
    done: ['村の子どもたちが編んだスカーフじゃ。グレイズの霧を織り込んだそうな。', 'お前さんはもう、この沼の守り人じゃよ。'] },
  casino: { giver: 'vivi', lv: 60, talk: ['lou', 'coco'], name: 'ストリップの常連', item: 'qset_memento_casino',
    offer: ['ストリップじゅうがあなたの噂で持ちきりよ。', 'ルーとココが、あなたに渡したいものがあるって。'],
    dbf: { qc_lou_rest: { offer: ['ルーが初めて勝ったって、みんな大騒ぎよ。', 'ルーとココが、あなたに渡したいものがあるって。'] },
      qc_lou_bet: { offer: ['ルーのお父さん、最後の勝負で笑ってたそうね。…いい話だわ。', 'ルーとココが、あなたに渡したいものがあるって。'] } },
    done: ['VIPだけが持てる金鎖よ。どのカジノでも顔パス。', 'あなたはもう、ここの常連ね。'] },
  rooftop: { giver: 'nova', lv: 76, talk: ['ivy', 'rook'], name: '摩天楼の住人', item: 'qset_memento_rooftop',
    offer: ['タワーの住人たちから、あなた宛ての贈り物を預かってるの。', 'その前に、アイビーとルークに会ってあげて。'],
    dbf: { qc_rook_talk: { offer: ['ルークとジェイ、屋上で並んでコーヒー飲んでたわ。あなたの話をしながらね。', 'その前に、アイビーとルークに会ってあげて。'] },
      qc_rook_fight: { offer: ['ジェイ、顔に絆創膏貼ってたけど、なんだか晴れやかだったわ。', 'その前に、アイビーとルークに会ってあげて。'] } },
    done: ['住人たちからの光輪よ。タワーの最上階と同じ色。', 'ようこそ、摩天楼の住人さん。'] },
  spaceport: { giver: 'dr_stella', lv: 90, talk: ['pip', 'chef_orbit'], name: 'ルミナの名誉職員', item: 'qset_memento_spaceport',
    offer: ['宇宙港の職員会議で、あなたを「名誉職員」にすることが決まったの。', 'ピップとオービットにも挨拶してきて。みんなで準備したんだから。'],
    done: ['名誉職員の証、軌道リングよ。実は小さな人工衛星なの。', 'これからもルミナ宇宙港をよろしくね。'] },
};
const MEMENTO_REGION_NAME = { beach: 'ヴァイス・ビーチ', downtown: 'ダウンタウン', slums: 'ポート・スラム', swamp: 'グレイズ村', casino: 'ゴールデン・ストリップ', rooftop: 'ヴァイス・タワー', spaceport: 'ルミナ宇宙港' };
for (const [region, r] of Object.entries(REGION_MEMENTO)) {
  const ss = Object.values(QUEST_SERIES).filter((s) => s.region === region);
  const prereq = [], prereqAny = [];
  for (const s of ss) (s.lastIds.length === 1 ? prereq.push(s.lastIds[0]) : prereqAny.push([...s.lastIds]));
  const m = {
    id: `q_memento_${region}`, name: `【記念】${r.name}`, category: 'sub', giver: r.giver, reqLevel: r.lv, prereq,
    ...(prereqAny.length ? { prereqAny } : {}),
    desc: `${MEMENTO_REGION_NAME[region]}の連作をすべて終えた記念。お世話になった人たちにあいさつしよう。`,
    dialog: { offer: r.offer, done: r.done }, ...(r.dbf ? { dialogByFlag: r.dbf } : {}),
    objectives: r.talk.map((npc) => T(npc, region, `${QUEST_NPCS[npc]?.name || npc}にあいさつする`)),
    reward: { exp: expOf(r.lv, 0.5), expFixed: true, money: money(r.lv, 2), items: [r.item, ...pots(r.lv)], flags: [`title_memento_${region}`] },
    series: 'memento', seriesName: '記念', episode: region, region, questKind: 'memento',
  };
  out.push(m);
}

// ============================================================ メイン 第2部 序章: 次元ゲート（m2_...。第1ワールドの中で完結。最後に world2Unlocked を立てる）
const m2 = (id, name, lv, giver, extra) => ({ id, name: `第2部 ${name}`, category: 'main', giver, reqLevel: lv, ...extra, questKind: 'main2' });
export const M2_IDS = ['m2_01_signal', 'm2_02_vega', 'm2_03_parts', 'm2_04_moon', 'm2_05_code', 'm2_06_legacy', 'm2_07_rift', 'm2_08_gate'];
const m2list = [
  m2('m2_01_signal', '序章 次元の残響', 100, 'dr_stella', {
    prereq: ['m15_don', 'sp05_overlord'],
    desc: 'ゾグの宇宙船から、止まったはずの信号が出ている。',
    dialog: {
      offer: ['ゾグの船を調べていたら、奇妙な信号を拾ったの。船はもう動かないはずなのに。', '信号は宇宙船の奥、アストラル体が集まる場所から出てる。調べてきて！'],
      done: ['クリスタルが共鳴してる…これは座標よ。', 'この宇宙のどこでもない、「別の次元」の座標。'],
    },
    objectives: [R('space_f4', '謎の宇宙船へ行く'), K('ghost_astral', 20, 'space_f4', '謎の宇宙船でアストラル体を倒す'), C('alien_crystal', 5, 'space_f4', '共鳴するエイリアン・クリスタルを集める')],
    reward: { money: 300000, items: ['elixir', 'elixir'] },
  }),
  m2('m2_02_vega', '第1話 ゲート技師ベガ', 100, 'dr_stella', {
    turnIn: 'gate_vega', prereq: ['m2_01_signal'],
    desc: '次元の座標を読めるのは、宇宙港の奥にいる技師ベガだけ。',
    dialog: {
      offer: ['次元の座標なんて、私の専門外。宇宙港の奥にいる技師ベガに会って。', '彼女は昔、「次元ゲート」なんていう夢物語を本気で研究してた人よ。', 'それと…ゾグの残留思念が、まだ船の奥でコアを守ってる。コアがないと座標は読めないわ。'],
      done: ['ゾグのコア…！ やっぱり。ゾグは「門」を通ってこっちに来たのよ。', '夢物語じゃなかった。次元ゲートは作れる。'],
    },
    objectives: [B('boss_alien', 'space_f4', '謎の宇宙船でオーバーロード・ゾグ（残留思念）を倒す'), C('alien_core', 1, 'space_f4', 'オーバーロード・コアを手に入れる'), T('gate_vega', 'spaceport', 'ゲート技師ベガに会う')],
    reward: { money: 320000, items: ['elixir', 'chip_reroll'] },
  }),
  m2('m2_03_parts', '第2話 門の骨組み', 101, 'gate_vega', {
    prereq: ['m2_02_vega'],
    desc: 'ゲートの骨組みには、宇宙船の部品と月のゴーレムの核が要る。',
    dialog: {
      offer: ['ゲートの骨組みを作るには、宇宙船の部品が要る。ゼノメカの歯車と、ムーンゴーレムの核。', '…笑わないでね。私、十年この日を待ってたの。'],
      done: ['いい部品。骨組みが立ったわ。…次は座標の「錨」ね。'],
    },
    objectives: [K('robot_xeno', 25, 'space_f4', '謎の宇宙船でゼノメカを倒す'), C('robot_gear', 20, 'space_f4', 'ロボの歯車を集める'), C('golem_core', 6, 'space_f3', '月面シミュ区画でゴーレムの核を集める')],
    reward: { money: 340000, items: ['elixir', 'power_elixir', 'power_elixir'] },
  }),
  m2('m2_04_moon', '第3話 月面の錨', 102, 'gate_vega', {
    turnIn: 'ace_jet', prereq: ['m2_03_parts'],
    desc: '座標の錨は月の石。月面区画のエースの協力がいる。',
    dialog: {
      offer: ['座標の錨は月の石。月面区画のエースに頼んで、区画の奥を開けてもらって。', '区画のゴーレムとローバーが、錨の場所を塞いでるはずよ。'],
      done: ['ベガの頼みか…あいつ、まだ諦めてなかったんだな。', '月の石は持っていけ。それと、ゲートの鍵コードはノヴァにしか書けないって伝言だ。'],
    },
    objectives: [K('golem_moon', 25, 'space_f3', '月面シミュ区画でムーンゴーレムを倒す'), K('robot_lunar', 20, 'space_f3', 'ルナローバーを倒す'), C('moon_rock', 6, 'space_f3', '錨にする月の石を集める')],
    reward: { money: 360000, items: ['elixir', 'chip_reroll'] },
  }),
  m2('m2_05_code', '第4話 鍵コード', 103, 'ace_jet', {
    turnIn: 'nova', prereq: ['m2_04_moon'],
    desc: 'ゲートを開く鍵コードを書けるのは、天才ハッカーのノヴァだけ。',
    dialog: {
      offer: ['ゲートを開く鍵コードは、とんでもない量子計算が要るらしい。屋上のノヴァに頼め。', 'ペントハウスの警備ドローンがまだ生きてる。ノヴァの回線に割り込んでくるから、落としてやってくれ。'],
      done: ['次元ゲートの鍵コード？ …面白いじゃない。', 'でも材料が足りない。ドンの金庫に、彼が隠してた「設計図」があるはずよ。'],
    },
    objectives: [K('drone_guardian', 25, 'tower_f3', '最上階ペントハウスでガーディアンドローンを落とす'), R('rooftop', 'ヴァイス・タワーへ行く')],
    reward: { money: 380000, items: ['elixir', 'drink_lucky'] },
  }),
  m2('m2_06_legacy', '第5話 ドンの遺産', 104, 'nova', {
    prereq: ['m2_05_code'],
    desc: 'ドン・カイマンは次元ゲートのことを知っていた。最上階の金庫に設計図がある。',
    dialog: {
      offer: ['ドン・カイマンはゲートのことを知ってた。…この街のネオンの秘密も、たぶん全部。', '金庫は最上階。でも、ドンの「影」がまだペントハウスを守ってる。'],
      done: ['設計図があった。…ドンは昔、ゲートの向こうから来た「誰か」と取引してたみたい。', '「ネオン・アーク」。向こう側の世界の名前よ。'],
    },
    dialogByFlag: {
      endingHero: { offer: ['ドンは今、刑務所の中。面会記録によると、彼は「門の設計図は最上階の金庫だ」とだけ言ったそうよ。', 'でも金庫は、ドンの「影」がまだ守ってる。'] },
      endingDon: { offer: ['あなたが「新しいボス」になったおかげで、金庫の鍵はあなたのもの。', 'でも中には、前の主の「影」がまだ居座ってるわ。'] },
    },
    objectives: [B('boss_don', 'tower_f3', '最上階ペントハウスでドン・カイマンの影を倒す'), C('gold_bar', 3, 'tower_f3', '金庫の鍵の材料（金の延べ棒）を集める')],
    reward: { money: 400000, items: ['elixir', 'chip_lock'] },
  }),
  m2('m2_07_rift', '第6話 次元の歪み', 105, 'gate_vega', {
    prereq: ['m2_06_legacy'],
    desc: 'ゲートの試運転で、宇宙船の中の空間が歪み始めた。',
    dialog: {
      offer: ['鍵コードと設計図がそろった。…でも試運転したら、宇宙船の中の空間が歪み始めたの。', '歪みからあふれたエイリアン戦士とヴォイドクラゲを抑えて！'],
      done: ['歪みが安定した。…あとは、開くだけ。'],
    },
    objectives: [K('alien_warrior', 30, 'space_f4', '謎の宇宙船でエイリアン戦士を抑える'), K('jelly_void', 25, 'space_f4', 'ヴォイドクラゲを抑える'), C('alien_crystal', 8, 'space_f4', '歪みを固定するクリスタルを集める')],
    reward: { money: 420000, items: ['elixir', 'tune_ticket'] },
  }),
  m2('m2_08_gate', '第7話 ネオン・アークへの扉', 106, 'gate_vega', {
    prereq: ['m2_07_rift'],
    desc: '次元ゲートを開く。ネオン・アークへの扉が、ルミナ宇宙港に現れる。',
    dialog: {
      offer: ['みんなに声をかけてきて。ステラ博士、エース、それからノヴァ。ゲートを開く瞬間は、みんなで見たいの。', '最後に、宇宙船のアストラル体を退けて。門の前は静かにしておきたい。'],
      done: ['…開いた。ルミナ宇宙港の次元ゲートが、向こうの世界とつながった。', 'ネオン・アーク。ネオンの未来都市の群島。ヴァイス・ベイの「上」にある世界。', 'この鍵はあなたのもの。行ってらっしゃい。…向こうのネオンも、きっとあなたを待ってる。'],
    },
    objectives: [T('dr_stella', 'spaceport', 'ステラ博士に声をかける'), T('ace_jet', 'spaceport', 'エース・ジェットに声をかける'), T('nova', 'rooftop', 'ノヴァに声をかける'), K('ghost_astral', 30, 'space_f4', '謎の宇宙船でアストラル体を退ける')],
    reward: { money: 500000, items: ['qset_gate_key', 'elixir', 'elixir', 'elixir'], sp: 3, flags: ['world2Unlocked', 'title_gate_opener'] },
  }),
];

export const QUESTS_W1 = [...out, ...m2list].map(hlMission);
