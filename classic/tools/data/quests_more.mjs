// クエストの大幅な追加（QUESTS.md 8 章）。地域ごとのファイル（quests_more/*.mjs）を集める。
// 行の形は quests.mjs と同じ: [ID, 名前, 依頼者, 依頼者のいるマップ, 受けられるLv, 前提, 目的, 大きさ, 報酬の品, あらすじ, 追加]
//   目的の印（quests.mjs の k / i / m に足した物。| の後ろが画面に出る文）:
//     [[t:NPC の ID|表示]]          その人と話す（届ける・話をつなぐ）
//     [[x:調べる物の ID:N|表示]]     マップの調べる物を調べる（下の O。クエストを進めている間だけ見つかる隠し物）
//     [[g:品の ID:N|表示]]           その品を N 個持っていく（敵の素材以外。渡す）
//     [[e:操作:N|表示]]              Core が知らせる操作（quest_goals.mjs の先頭）と、長い目標
//                                     kinds_killed（倒した敵の種類）/ bosses_killed（ボス・強敵の種類）/ towns_visited（町）/ maps_visited（マップ）/ quests_done（終えたクエスト）
//   追加（11 列目。無くてよい）:
//     end: 報告先の NPC の ID（無ければ依頼者）/ ordered: true（目的を上から順にしか進められない。ヒント → 見つける）
//     repeat: 'daily'（毎日 1 回）/ hours: [から, まで]（隠し: その時間だけ受けられる。日本の時間。夜をまたいでよい）
//     needItem: 品の ID（隠し: その品を持って話すと受けられる。渡さない）
// O: クエストの調べる物 [ID, 名前, マップ, 置き場（secret / high / upper / left / right / mid）, クエスト]
//    → Data/tools/world/world.mjs が生成したマップに置く。そのクエストを進めている間だけ見つかる。
// S: クエスト専用の敵 [敵, マップ, クエスト] → そのクエストを進めている間だけ、そのマップに 1 体湧く（10 秒で湧き直す）。
import * as island from './quests_more/island.mjs';
import * as breeze from './quests_more/breeze.mjs';
import * as pom from './quests_more/pom.mjs';
import * as silva from './quests_more/silva.mjs';
import * as gard from './quests_more/gard.mjs';
import * as crow from './quests_more/crow.mjs';
import * as nemuri from './quests_more/nemuri.mjs';
import * as market from './quests_more/market.mjs';
import * as mid from './quests_more/mid.mjs';
import * as high from './quests_more/high.mjs';
import * as extra from './quests_more/extra.mjs';
import * as fill from './quests_more/fill.mjs';

const PARTS = [island, breeze, pom, silva, gard, crow, nemuri, market, mid, high, extra, fill];
// 寄り道の印（side）を付ける。寄り道の報酬は式の経験値 × SIDE_EXP・お金 × SIDE_MESO（決めた値。数が多いので、全部やっても Lv が飛ばないように。QUESTS.md 1-4）
export const SIDE_EXP = 0.35;
export const SIDE_MESO = 0.6;
export const QUESTS_MORE = PARTS.flatMap((p) => p.Q).map((r) => [...r.slice(0, 10), { side: true, ...(r[10] || {}) }]);
export const QUEST_OBJECTS = PARTS.flatMap((p) => p.O || []).map(([id, name, map, at, quest]) => ({ id, name, map, at, quest }));
export const QUEST_SPAWNS = PARTS.flatMap((p) => p.S || []);
