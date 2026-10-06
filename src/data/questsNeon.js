// v5（システム担当）: ネオン・コアの専用クエスト（docs/SPEC_V5.md・docs/NEON_CORE.md）
//  - nc_01_awaken: アーク・シティ。最初の 2 マップの先（データ・コア）で「光の壁」にぶつかる話。
//      受けるとネオン・フラグメントが落ちるようになり、終えるとネオン・コアの窓とアーク・シティのコアが開く。
//  - nc_cyberwild / nc_abyss / nc_zenith: その地域のコアを開く。
//  書き方は questsW2.js と同じ（missions.js の読み込みの区画が MISSIONS に足す）。NPC は今いる第2ワールドの NPC。
//  受けられる条件はメインの話（m2_*）の進み具合に合わせる: nc_01 は m2_10（イオに会う）の後、ほかはその地域に着く話の後。
//  報酬: exp = expToNext(Lv+2) × 0.4（expFixed）、お金 = 10 × Lv² × 2、ネオン・フラグメント、コアを開くフラグ（data/neonCore.js の coreFlag）。
import { expToNext } from './balance.js';
import { hl2 } from './questsW2.js';
import { FRAGMENT_ID, NEON_UNLOCK_FLAG, coreFlag } from './neonCore.js';

const K = (target, count, mapId, text) => ({ type: 'kill', target, count, mapId, text });
const R = (target, text) => ({ type: 'reach', target, count: 1, text });
const money = (lv, mul = 1) => Math.max(100, Math.round((10 * lv * lv * mul) / 10) * 10);
const expOf = (lv, f) => Math.round(expToNext(Math.min(199, lv + 2)) * f);
const frags = (n) => Array.from({ length: n }, () => FRAGMENT_ID);
const hlLines = (a) => a.map(hl2);

function nq(id, o) {
  return {
    id, name: `【ネオン・コア】${o.name}`, category: 'sub', giver: o.giver, reqLevel: o.lv, prereq: o.prereq, desc: o.desc,
    dialog: { offer: hlLines(o.offer), done: hlLines(o.done) }, objectives: o.objectives,
    reward: { exp: expOf(o.lv, 0.4), expFixed: true, money: money(o.lv, 2), items: [...frags(o.frags), 'power_elixir', 'elixir'], flags: o.flags },
    region: o.region, questKind: 'neon', world: 2, series: 'neoncore', seriesName: 'ネオン・コア', episode: o.region,
  };
}

export const QUESTS_NEON = [
  nq('nc_01_awaken', {
    name: '光の壁', giver: 'ark_io', lv: 110, prereq: ['m2_10_blackout'], region: 'arkcity', frags: 15,
    flags: [NEON_UNLOCK_FLAG, coreFlag('arkcity')],
    desc: 'ネオン摩天街の先で、攻撃がまるで通らない「光の壁」にぶつかった。イオはネオン・フラグメントを集めろと言う。',
    offer: [
      'データ・コアの手前で、攻撃がまるで効かなかったでしょう？ …それは、あなたの体がこの世界の光になじんでいないから。',
      'ネオン・アークの光は、外から来た人をはじくの。強さの問題じゃない。ネオン適性の問題。',
      'ネオン摩天街のアーク警備ボットの中には、光が固まったネオン・フラグメントが入ってることがある。今のあなたなら、きっと見えるはず。',
      'まずはデータ・コアの入口まで行って、壁を自分の目で確かめて。それから、フラグメントを探して。',
    ],
    done: [
      '…やっぱり。フラグメントが、あなたの手の中で光ってる。',
      '灯守に伝わる「ネオン・コア」を、あなたに預ける。フラグメントを注ぐほど、この世界の光になじめるの。',
      'まずはアーク・シティのコアから。コアを育てれば、データ・コアの奥でも戦えるようになる。',
    ],
    objectives: [R('w2_arkcity_f3', 'データ・コアの入口まで行って、光の壁を確かめる'), K('ark_robot_guard', 30, 'w2_arkcity_f2', 'ネオン摩天街でアーク警備ボットを倒し、フラグメントを探す')],
  }),
  nq('nc_cyberwild', {
    name: '森のコア', giver: 'w2_wild_elder', lv: 126, prereq: ['nc_01_awaken', 'm2_14_wild'], region: 'cyberwild', frags: 15,
    flags: [coreFlag('cyberwild')],
    desc: '長老シードが、森の根に眠るネオン・コアの片割れを目覚めさせてくれるという。',
    offer: [
      'ほう、イオのコアを持っておるのか。…ならば、森の光にもなじめるはずじゃ。',
      '電脳の林道のワイヤースネークは、森の光を飲みこんで太る。あれを鎮めて、ネオン樹海まで来てくれ。',
      '森の根に眠るコアを、お前のコアにつないでやろう。',
    ],
    done: [
      '…根が応えた。サイバー・ワイルドのコアが、お前のコアとつながったぞ。',
      'フラグメントを注げば、森の奥でも力が通る。ネオン樹海の先は、それからじゃ。',
    ],
    objectives: [K('wild_snake_wire', 40, 'w2_cyberwild_f1', '電脳の林道でワイヤースネークを鎮める'), R('w2_cyberwild_f2', 'ネオン樹海へ行く')],
  }),
  nq('nc_abyss', {
    name: '深海のコア', giver: 'w2_abyss_diver', lv: 151, prereq: ['nc_cyberwild', 'm2_18_deep'], region: 'abyss', frags: 20,
    flags: [coreFlag('abyss')],
    desc: 'ダイバー・ギルが、深海の圧に負けない光——ネオン・アビスのコアの在りかを知っている。',
    offer: [
      '深海じゃ、光も重くなる。上のコアだけじゃ、サンゴの迷宮から先は息が続かねえぞ。',
      '沈んだ連絡橋の耐圧ガニが、殻の中に光をため込んでる。そいつらを割って、サンゴの迷宮まで潜ってこい。',
    ],
    done: [
      '…見ろ、お前のコアが青く光った。ネオン・アビスのコアが目を覚ましたんだ。',
      'フラグメントを注いでやれ。深いところほど、光は重いからな。',
    ],
    objectives: [K('abyss_crab_pressure', 40, 'w2_abyss_f1', '沈んだ連絡橋で耐圧ガニを倒す'), R('w2_abyss_f2', 'サンゴの迷宮へ行く')],
  }),
  nq('nc_zenith', {
    name: '天のコア', giver: 'w2_zenith_oracle', lv: 176, prereq: ['nc_abyss', 'm2_22_ascend'], region: 'zenith', frags: 25,
    flags: [coreFlag('zenith')],
    desc: '星詠みのセレネが、最後のコア——ゼニス・タワーのコアを目覚めさせる方法を告げる。',
    offer: [
      '星が告げています。あなたのコアには、まだひとつ、空いた場所があると。',
      '雲海の参道のクラウドスライムは、天の光のしずく。それを集めて、天空の螺旋へ昇ってください。',
    ],
    done: [
      '…四つのコアが、ひとつの星座になりました。ゼニス・タワーのコアです。',
      'フラグメントを注ぐほど、頂の光にもなじめるでしょう。…ソブリンの光にも。',
    ],
    objectives: [K('zen_slime_cloud', 40, 'w2_zenith_f1', '雲海の参道でクラウドスライムを倒す'), R('w2_zenith_f2', '天空の螺旋へ行く')],
  }),
];
export const NEON_QUEST_IDS = QUESTS_NEON.map((m) => m.id);
