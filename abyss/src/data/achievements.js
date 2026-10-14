// 実績・称号・実績ポイントの効果。ロジックは game/systems/achievements.js。
//
// 実績の形: { id, cat, name, desc, metric（数える物）, n（必要な数）, tier（段 1〜）, points, title?（もらえる称号の id）, secret?（達成まで隠す）, arg? }
//   metric は achievements.js の METRICS で数える（kills・elites・level・found:legendary・act:3 など）。
// 称号の形: { id, name, desc, mods: [{ s, v }] } … 選んだ 1 つだけが効く。
// 実績ポイント 1 につき POINT_BONUS の効果（祭壇・星晶で増える）。

import { RARITIES } from './rarity.js';

export const ACH_CATEGORIES = [
  { id: 'combat', name: '戦い', icon: '⚔' },
  { id: 'progress', name: '冒険', icon: '🗺' },
  { id: 'growth', name: '成長', icon: '⬆' },
  { id: 'loot', name: '戦利品', icon: '💎' },
  { id: 'craft', name: '鍛冶と宝石', icon: '⚒' },
  { id: 'endgame', name: '深淵', icon: '🌀' },
  { id: 'prestige', name: '輪廻', icon: '♻' },
  { id: 'collect', name: '図鑑とペット', icon: '📖' },
  { id: 'life', name: '暮らし', icon: '⏳' },
  { id: 'secret', name: '秘密', icon: '？' },
];

/** 段ごとの実績ポイント */
export const TIER_POINTS = [5, 10, 15, 25, 40, 60, 90, 130];
export const SECRET_POINTS = 25;

/** 実績ポイント 1 あたりの効果（強さ担当: 全部で約 3,900 pt。物語の終わりで約 1,000 pt → ダメージ +50%・ライフ +20% くらい。
 *  全部そろえてもダメージ +195%（祭壇・星晶の誉れで最大 ×2）。足し算の枠なので、終盤の増加 % の山の中では効きすぎない） */
export const POINT_BONUS = [
  { s: 'inc_dmg', v: 0.05 },
  { s: 'inc_life', v: 0.02 },
  { s: 'gold_find', v: 0.05 },
  { s: 'xp_bonus', v: 0.02 },
  { s: 'magic_find', v: 0.01 },
];

const L = [];
const nf = (n) => {
  if (n >= 1e16) return `${n / 1e16}京`;
  if (n >= 1e12) return `${n / 1e12}兆`;
  if (n >= 1e8) return `${n / 1e8}億`;
  if (n >= 1e4) return `${n / 1e4}万`;
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/** 段つきの実績をまとめて作る。rows: [[n, name, title?], ...] */
function tiered(cat, metric, rows, descFn, opts = {}) {
  rows.forEach(([n, name, title], i) => {
    L.push({
      id: `${opts.idp || metric.replace(/[:]/g, '_')}_${i + 1}`, cat, metric, arg: opts.arg, n, tier: i + 1 + (opts.tierOffset || 0),
      name, desc: descFn(n, nf(n)), points: TIER_POINTS[Math.min(TIER_POINTS.length - 1, i + (opts.tierOffset || 0))], title,
    });
  });
}
function single(cat, id, metric, n, name, desc, o = {}) {
  L.push({ id, cat, metric, n, tier: o.tier || 1, name, desc, points: o.points ?? TIER_POINTS[(o.tier || 1) - 1], title: o.title, secret: o.secret, arg: o.arg });
}

// ---------------- 戦い
tiered('combat', 'kills', [
  [100, '最初の百'], [1000, '千の屍', 'title_ashwalker'], [10000, '屍の山'], [100000, '血の河', 'title_slayer'], [1000000, '殲滅の刃'], [10000000, '深淵の掃除人', 'title_endless'], [100000000, '終わりなき刃'],
], (n, s) => `敵を ${s} 体倒す`);
tiered('combat', 'elites', [
  [10, '精鋭狩りの初陣'], [100, '精鋭狩り'], [1000, '群れの長の天敵'], [10000, '精鋭の墓守', 'title_elite'], [100000, '王冠を砕く者'],
], (n, s) => `エリート（チャンピオン・群れの長）を ${s} 体倒す`);
tiered('combat', 'bosses', [
  [1, '最初の大物'], [10, 'ボス狩り'], [100, '百の首級'], [1000, '王殺し', 'title_kingslayer'], [10000, '玉座の簒奪者'],
], (n, s) => `ボスを ${s} 体倒す`);
tiered('combat', 'goblins', [
  [1, '逃がさない'], [10, 'ため込み屋の天敵'], [100, '財宝の追跡者', 'title_goblin'], [1000, '黄金の狩人'],
], (n, s) => `ため込み屋を ${s} 体倒す`);
tiered('combat', 'highestHit', [
  [1e4, '重い一撃'], [1e6, '岩をも砕く'], [1e8, '山をも裂く'], [1e12, '星砕き', 'title_starbreaker'], [1e16, '理を越える一撃'],
], (n, s) => `1 回で ${s} 以上のダメージを与える`);
tiered('combat', 'deaths', [
  [1, '最初の敗北'], [50, '倒れても立つ'], [500, '不撓の魂'],
], (n, s) => `${s} 回倒れる（倒れるのも経験）`);

// ---------------- 冒険（地域・章）
tiered('progress', 'zones', [
  [1, '灰の外へ'], [5, '旅の始まり'], [10, '踏破者'], [25, '地図を描く者'], [50, '世界の果てまで'],
], (n, s) => `地域のボスを倒して ${s} 個の地域を踏破する`);
const ACT_NAMES = ['灰の村の救い手', '砂の墓所を越えて', '吹雪を抜けて', '沈んだ都の解放', '溶鉱炉を越えて', '毒霧を晴らす', '天の城を落とす', '機巧の迷宮を出る', '虚無を渡る', '深淵の王を討つ'];
const ACT_JP = ['第一章', '第二章', '第三章', '第四章', '第五章', '第六章', '第七章', '第八章', '第九章', '第十章'];
const ACT_TITLES = { 0: 'title_village', 4: 'title_forge', 9: 'title_abyss' };
ACT_NAMES.forEach((name, i) => single('progress', `act_${i + 1}`, 'act', 1, name, `${ACT_JP[i]}の最後のボスを倒す`, { arg: i, tier: Math.min(8, 1 + Math.floor(i / 2)), title: ACT_TITLES[i] }));
tiered('progress', 'stages', [
  [10, '一歩ずつ'], [100, '百の戦場'], [1000, '千の戦場'], [10000, '終わらない行軍'],
], (n, s) => `ステージを ${s} 回クリアする`);

// ---------------- 成長
tiered('growth', 'level', [
  [5, '駆け出し'], [10, '一人前の冒険者', 'title_novice'], [25, '熟練の戦士'], [50, '歴戦の勇士'], [75, '英雄の器'], [100, '極めし者', 'title_master'],
], (n) => `レベル ${n} になる`);
tiered('growth', 'paragon', [
  [1, '限界の向こう'], [10, '果てなき修練'], [50, '求道者'], [100, '百の悟り'], [250, '深き悟り'], [500, '無限の階'], [1000, '無限の求道者', 'title_paragon'],
], (n) => `パラゴン ${n} になる`);
tiered('growth', 'skillMax', [
  [5, '技を磨く'], [10, '技の達人'], [20, '奥義の域'],
], (n) => `どれか 1 つのスキルを Lv ${n} にする`);

// ---------------- 戦利品
const RNAME = Object.fromEntries(RARITIES.map((r) => [r.id, r.name]));
const LOOT_ROWS = {
  magic: [[100, '魔力を帯びた品'], [1000, '青の収集家'], [10000, '青い山']],
  rare: [[10, '黄金の輝き'], [100, 'レアの目利き'], [1000, '光の柱の常連'], [10000, '黄金の倉']],
  epic: [[1, '紫の閃き'], [50, '紫の衣'], [500, '紫の宝庫']],
  legendary: [[1, '伝説との出会い'], [25, '伝説を集める者'], [250, '伝説の蔵'], [1000, '伝説が日常']],
  set: [[1, '揃いの欠片'], [25, '揃いを求めて'], [100, '揃いの蒐集家']],
  unique: [[1, '唯一無二'], [25, '銘品の収集家'], [100, '銘品の蔵']],
  mythic: [[1, '神話の担い手', 'title_mythic'], [5, '神話を重ねる'], [12, '神話の蒐集家']],
};
for (const [r, rows] of Object.entries(LOOT_ROWS)) tiered('loot', `found:${r}`, rows, (n, s) => `${RNAME[r]}を ${s} 個拾う`, { idp: `found_${r}`, arg: r });
tiered('loot', 'ancient', [[1, '太古の輝き'], [10, '太古の目'], [100, '太古の蔵'], [1000, '太古の王']], (n, s) => `太古の装備を ${s} 個拾う`);
tiered('loot', 'primal', [[1, '原初の目', 'title_primal'], [10, '原初を知る者'], [50, '原初の主']], (n, s) => `原初の装備を ${s} 個拾う`);
tiered('loot', 'salvaged', [[100, '分解の手始め'], [1000, '分解職人'], [10000, '素材の山'], [100000, '解体の鬼']], (n, s) => `装備を ${s} 個分解する`);

// ---------------- 鍛冶と宝石
tiered('craft', 'crafted', [[1, '槌を握る'], [50, '鍛冶場の常連'], [500, '炉の番人'], [5000, '名工の手']], (n, s) => `鍛冶（強化・付け替えなど）を ${s} 回行う`);
tiered('craft', 'maxEnh', [[5, '+5 の輝き'], [10, '+10 の刃'], [15, '+15 の業物'], [20, '+20 の神器', 'title_smith']], (n) => `装備を +${n} まで強化する`);
tiered('craft', 'gemTier', [[3, '原石を磨く'], [5, '宝石細工'], [7, '輝ける宝玉'], [10, '至高の宝石']], (n) => `段階 ${n} の宝石を手に入れる`);
tiered('craft', 'lgemUp', [[1, '深淵の宝石'], [10, '宝石を育てる'], [50, '宝石の守り手'], [200, '宝石の王']], (n, s) => `深淵の宝石を ${s} 回成長させる`);
tiered('craft', 'runewords', [[1, '言葉を刻む'], [5, '刻まれた詩'], [20, 'すべての言葉']], (n, s) => `ルーン語の装備を ${s} 種類作る`);
tiered('craft', 'codex', [[1, '書庫の扉'], [10, '書庫の司書'], [50, '力の書庫の主']], (n, s) => `力の書庫に伝説の力を ${s} 種類しまう`);

// ---------------- 深淵（苦行・裂け目）
tiered('endgame', 'torment', [[1, '苦行の門'], [4, '苦行 IV'], [8, '苦行 VIII'], [12, '苦行 XII'], [16, '苦行の果て', 'title_torment']], (n) => `苦行 ${['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'][n]} を解放する`);
tiered('endgame', 'riftBest', [[1, '裂け目を覗く'], [10, '裂け目の十'], [25, '裂け目の二十五'], [50, '裂け目の五十'], [75, '深き裂け目'], [100, '裂け目の覇者', 'title_rift'], [150, '底なしの底']], (n) => `深淵の裂け目の段階 ${n} をクリアする`);
tiered('endgame', 'riftRuns', [[1, '初めての裂け目'], [10, '裂け目の常連'], [100, '裂け目の住人'], [500, '裂け目に生きる']], (n, s) => `深淵の裂け目を ${s} 回クリアする`);

// ---------------- 輪廻
tiered('prestige', 'rebirths', [[1, '最初の輪廻'], [5, '五度目の目覚め'], [10, '輪廻を巡る者', 'title_reborn'], [25, '輪廻の常客'], [50, '輪廻の主'], [100, '百度の生']], (n, s) => `${s} 回転生する`);
tiered('prestige', 'totalSouls', [[100, '魂の灯'], [1000, '魂の炎'], [10000, '魂の大火'], [100000, '魂の太陽']], (n, s) => `魂を合計 ${s} 集める`);
tiered('prestige', 'transcends', [[1, '星を纏う者', 'title_star'], [3, '三つの星'], [10, '星座となる']], (n, s) => `${s} 回超越する`);
tiered('prestige', 'altarLv', [[10, '祭壇に灯を'], [100, '祭壇の守り手'], [500, '祭壇の主']], (n, s) => `魂の祭壇の強化を合計 Lv ${s} にする`);

// ---------------- 図鑑とペット
tiered('collect', 'species', [[5, '魔物の観察'], [20, '魔物学者'], [50, '魔物博士'], [100, '魔物図鑑の主', 'title_scholar']], (n, s) => `${s} 種類の魔物を倒す（魔物図鑑）`);
tiered('collect', 'bestiaryTier4', [[1, '一種を極める'], [10, '十種を極める'], [30, '天敵']], (n, s) => `${s} 種類の魔物を 10,000 体ずつ倒す`);
tiered('collect', 'treasures', [[1, '宝物図鑑の一頁'], [10, '宝物を記す'], [50, '宝物の目録'], [150, '宝物図鑑の主']], (n, s) => `宝物図鑑に ${s} 個登録する（ユニーク・セット・ミシック・伝説の力）`);
tiered('collect', 'pets', [[1, '最初の相棒'], [5, '仲間が増えた'], [10, '獣使い'], [15, '獣の群れ'], [20, '獣たちの友', 'title_beast']], (n, s) => `ペットを ${s} 種類持つ`);
tiered('collect', 'petLevel', [[5, '育つ相棒'], [20, '頼れる相棒'], [50, '最強の相棒']], (n) => `ペットを Lv ${n} に育てる`);
tiered('collect', 'hatched', [[1, '殻を破る'], [10, '孵化の名人'], [50, '卵の守り手'], [100, '巣の主']], (n, s) => `卵を ${s} 個孵す`);

// ---------------- 暮らし
tiered('life', 'goldEarned', [[1e4, '小銭入れ'], [1e6, '財布が重い'], [1e8, '金貸し'], [1e10, '大商人'], [1e12, '黄金王', 'title_gold'], [1e16, '国を買う者']], (n, s) => `ゴールドを合計 ${s} 稼ぐ`);
tiered('life', 'playHours', [[1, '一時間の冒険'], [10, '十時間の旅'], [50, '五十時間の戦い'], [100, '百時間の物語'], [500, '五百時間の伝説'], [1000, '千時間の深淵']], (n) => `合計 ${n} 時間遊ぶ`);
tiered('life', 'offlineHours', [[10, '寝る子は育つ'], [100, '眠れる勇者', 'title_sleeper'], [1000, '夢の住人']], (n) => `放置で合計 ${n} 時間稼ぐ`);
tiered('life', 'bounties', [[1, '最初の日課'], [10, '日課の習慣'], [50, '勤勉な狩人', 'title_diligent'], [200, '日課の鬼'], [500, '日課の神']], (n, s) => `日課・週課を ${s} 回達成する`);
tiered('life', 'logins', [[7, '七日の灯'], [30, 'ひと月の旅'], [100, '百日の誓い'], [365, '一年の物語']], (n) => `ログインの贈り物を ${n} 回受け取る`);
tiered('life', 'achCount', [[25, '誉れの始まり'], [50, '誉れを重ねる'], [100, '誉れ高き者', 'title_honor'], [150, '誉れの殿堂']], (n) => `実績を ${n} 個達成する`);

// ---------------- 秘密（達成するまで「？？？」）
const SECRET = (id, metric, n, name, desc, title) => single('secret', id, metric, n, name, desc, { secret: true, points: SECRET_POINTS, tier: 3, title });
SECRET('secret_night', 'nightOwl', 1, '夜更けの探索者', '真夜中の 2 時から 4 時のあいだに遊ぶ', 'title_night');
SECRET('secret_speed', 'speed4', 1, '時を急ぐ者', '速度 ×4 で戦う');
SECRET('secret_mythic_salvage', 'mythicSalvaged', 1, '価値を知らぬ者', 'ミシックの装備を分解する');
SECRET('secret_bagfull', 'bagFull', 1, '溢れる鞄', 'バッグをいっぱいにする');
SECRET('secret_oneshot', 'oneShotBoss', 1, '一撃必殺', 'ボスをまだ傷のない状態から 1 回の攻撃で倒す');
SECRET('secret_longsleep', 'longOffline', 1, '果報は寝て待て', '1 回で 20 時間以上離れてから戻る');
SECRET('secret_fastrebirth', 'fastRebirth', 1, '急ぎの輪廻', '周回を始めて 30 分以内に転生する');
SECRET('secret_legendpet', 'legendPet', 1, '伝説との邂逅', 'レジェンダリーのペットを孵す');
SECRET('secret_curious', 'panels', 15, '好奇心', 'すべての窓を開いてみる');
SECRET('secret_closecall', 'lowLifeBoss', 1, '紙一重', 'ライフ 5% 未満でボスを倒す');
SECRET('secret_naked', 'nakedBoss', 1, '裸の勇者', '武器のほかに何も身に着けずにボスを倒す');
SECRET('secret_deaths', 'deaths', 1000, '死を恐れぬ者', '1,000 回倒れる');

export const ACHIEVEMENTS = L;
export const ACH = Object.fromEntries(L.map((a) => [a.id, a]));

// ---------------- 称号（選んだ 1 つだけ効く）
export const TITLES = [
  { id: 'title_village', name: '灰の村の救い手', desc: '最大ライフ +3%', mods: [{ s: 'inc_life', v: 3 }] },
  { id: 'title_novice', name: '一人前の冒険者', desc: '経験値 +5%', mods: [{ s: 'xp_bonus', v: 5 }] },
  { id: 'title_ashwalker', name: '屍を踏み越えし者', desc: '全ダメージ +3%', mods: [{ s: 'inc_dmg', v: 3 }] },
  { id: 'title_slayer', name: '血の河を渡る者', desc: '全ダメージ +8%', mods: [{ s: 'inc_dmg', v: 8 }] },
  { id: 'title_endless', name: '深淵の掃除人', desc: '全ダメージ +15%・移動速度 +5%', mods: [{ s: 'inc_dmg', v: 15 }, { s: 'move_speed', v: 5 }] },
  { id: 'title_elite', name: '精鋭の墓守', desc: 'エリートへのダメージ +12%', mods: [{ s: 'dmg_elite', v: 12 }] },
  { id: 'title_kingslayer', name: '王殺し', desc: 'ボスへのダメージ +12%', mods: [{ s: 'dmg_boss', v: 12 }] },
  { id: 'title_goblin', name: 'ため込み屋の天敵', desc: 'ゴールド獲得 +20%', mods: [{ s: 'gold_find', v: 20 }] },
  { id: 'title_starbreaker', name: '星砕き', desc: 'クリティカルダメージ +15%', mods: [{ s: 'crit_damage', v: 15 }] },
  { id: 'title_forge', name: '溶鉱炉を越えし者', desc: '火炎ダメージ +8%・火炎耐性 +5%', mods: [{ s: 'inc_fire', v: 8 }, { s: 'res_fire', v: 5 }] },
  { id: 'title_abyss', name: '深淵の踏破者', desc: '与えるダメージ ×1.03（最終）', mods: [{ s: 'more_dmg', v: 3 }] },
  { id: 'title_master', name: '極めし者', desc: '全能力 +20', mods: [{ s: 'all_attr', v: 20 }] },
  { id: 'title_paragon', name: '無限の求道者', desc: '最大ライフ +10%', mods: [{ s: 'inc_life', v: 10 }] },
  { id: 'title_mythic', name: '神話の担い手', desc: 'レア発見率 +10%', mods: [{ s: 'magic_find', v: 10 }] },
  { id: 'title_primal', name: '原初の目', desc: 'レア発見率 +5%・クリティカルダメージ +10%', mods: [{ s: 'magic_find', v: 5 }, { s: 'crit_damage', v: 10 }] },
  { id: 'title_smith', name: '名工', desc: 'アーマー +12%', mods: [{ s: 'inc_armor', v: 12 }] },
  { id: 'title_torment', name: '苦行の果て', desc: '受けるダメージ -3%', mods: [{ s: 'dr', v: 3 }] },
  { id: 'title_rift', name: '裂け目の覇者', desc: 'ボスへのダメージ +8%・全ダメージ +5%', mods: [{ s: 'dmg_boss', v: 8 }, { s: 'inc_dmg', v: 5 }] },
  { id: 'title_reborn', name: '輪廻を巡る者', desc: '経験値 +10%', mods: [{ s: 'xp_bonus', v: 10 }] },
  { id: 'title_star', name: '星を纏う者', desc: '与えるダメージ ×1.02（最終）・最大ライフ +3%', mods: [{ s: 'more_dmg', v: 2 }, { s: 'inc_life', v: 3 }] },
  { id: 'title_scholar', name: '魔物図鑑の主', desc: '全ダメージ +6%', mods: [{ s: 'inc_dmg', v: 6 }] },
  { id: 'title_beast', name: '獣たちの友', desc: '移動速度 +10%・召喚物のライフ +10%', mods: [{ s: 'move_speed', v: 10 }, { s: 'minion_life', v: 10 }] },
  { id: 'title_gold', name: '黄金王', desc: 'ゴールド獲得 +25%', mods: [{ s: 'gold_find', v: 25 }] },
  { id: 'title_sleeper', name: '眠れる勇者', desc: '放置の稼ぎ +10%', mods: [{ s: 'offline_gain', v: 10 }] },
  { id: 'title_diligent', name: '勤勉な狩人', desc: 'ゴールド獲得 +10%・経験値 +5%', mods: [{ s: 'gold_find', v: 10 }, { s: 'xp_bonus', v: 5 }] },
  { id: 'title_honor', name: '誉れ高き者', desc: '全ダメージ +5%・最大ライフ +5%', mods: [{ s: 'inc_dmg', v: 5 }, { s: 'inc_life', v: 5 }] },
  { id: 'title_night', name: '夜更けの探索者', desc: 'レア発見率 +3%', mods: [{ s: 'magic_find', v: 3 }] },
];
export const TITLE = Object.fromEntries(TITLES.map((t) => [t.id, t]));
