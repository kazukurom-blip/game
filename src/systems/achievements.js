// 実績（アチーブメント）・称号・実績ランク — REFERENCE_MAPLE_SYSTEMS A-5
//  100件: 戦闘30 / 成長20 / 収集20 / ボス15 / GTA10 / 隠し5。ポイント合計でランク E〜S（ランクごとに全ステ +3）。
//  state.achv = {done:{id: 達成時刻}, counters:{key: n}, seen:{id:true}}。実績はキャラ間で共有（shared.js 'nvs_shared'）。
//  称号: 実績・ストーリー分岐・タワーで入手。state.title に選択中の称号ID（HUD 名前横に表示: currentTitle(state)）。
import { ENEMIES, BOSS_IDS, NIGHT_ENEMY_IDS, ENEMY_REGIONS } from '../data/enemies.js';
import { ITEMS, PET_IDS } from '../data/items.js';
import { MISSIONS } from '../data/missions.js';
import { WORLD_MAP_IDS, TOWN_IDS } from './travel.js';
import { bookBonus, bookProgress, bookRank, BOOK_IDS } from './book.js';
import { isNight } from '../data/balance.js';
import { sharedAchievements, recordSharedAchievement } from './shared.js';

export const ACH_CATEGORIES = {
  combat: '戦闘', growth: '成長', collection: '収集', boss: 'ボス', gta: 'ストリート', hidden: '隠し',
};
export const ACH_RANKS = [
  { id: 'E', points: 0 }, { id: 'D', points: 100 }, { id: 'C', points: 300 },
  { id: 'B', points: 700 }, { id: 'A', points: 1200 }, { id: 'S', points: 2000 },
];
export const ACH_RANK_ALLSTAT = 3;

const list = [];
const T = (p) => p; // points
function A(cat, id, name, desc, points, test, extra = {}) { list.push({ cat, id, name, desc, points, test, ...extra }); }
const c = (st, k) => st.achv?.counters?.[k] || 0;
const maxStar = (st) => {
  let m = 0;
  for (const s of st.inventory || []) if (s && s.star > m) m = s.star;
  for (const s of Object.values(st.equippedInst || {})) if (s && s.star > m) m = s.star;
  return Math.max(m, c(st, 'maxStar'));
};
const GRADE_ORDER = { rare: 1, epic: 2, legendary: 3, mythic: 4 };
const bestPot = (st) => {
  let m = 0;
  const f = (s) => { if (s?.pot && GRADE_ORDER[s.pot.grade] > m) m = GRADE_ORDER[s.pot.grade]; };
  (st.inventory || []).forEach(f); Object.values(st.equippedInst || {}).forEach(f);
  return Math.max(m, c(st, 'bestPot'));
};
const bossClears = (st, mode) => Object.values(st.bosses || {}).reduce((a, b) => a + (b?.[mode]?.clears || 0), 0);

// ------------------------------------------------------------ 戦闘 30
for (const [n, p, title] of [[1, 5], [10, 5], [100, 10], [500, 10], [1000, 20], [5000, 20], [10000, 40, '狩りの達人'], [50000, 40, 'ヴァイス・ベイの掃除屋']]) {
  A('combat', `kills_${n}`, `撃破 ${n.toLocaleString()}`, `モンスターを累計 ${n.toLocaleString()} 体倒す`, p, (st) => (st.kills || 0) >= n, title ? { title } : {});
}
A('combat', 'night_kills_50', '夜の住人', '夜（20〜5時）にモンスターを 50 体倒す', 10, (st) => c(st, 'nightKills') >= 50);
A('combat', 'night_kills_500', 'ミッドナイト・ハンター', '夜にモンスターを 500 体倒す', 20, (st) => c(st, 'nightKills') >= 500, { title: 'ミッドナイト・ハンター' });
for (const [n, p, title] of [[10, 5], [30, 10], [50, 10], [100, 20, 'コンボ・マスター'], [200, 40, 'ネオン・ストリーム']]) {
  A('combat', `combo_${n}`, `${n} コンボ`, `コンボを ${n} 以上つなぐ`, p, (st) => c(st, 'maxCombo') >= n, title ? { title } : {});
}
A('combat', 'night_all', '夜の図鑑', '夜限定のモンスターを全種類倒す', 20, (st) => NIGHT_ENEMY_IDS.every((id) => (st.book?.[id] || 0) > 0));
for (const [n, p] of [[100, 5], [1000, 10], [10000, 20]]) A('combat', `skills_${n}`, `スキル ${n.toLocaleString()} 回`, `スキルを累計 ${n.toLocaleString()} 回使う`, p, (st) => c(st, 'skillUses') >= n);
const REGION_JP = { beach: 'ビーチ', downtown: 'ダウンタウン', slums: 'ポート・スラム', swamp: 'スワンプ', casino: 'カジノ', rooftop: 'ヴァイス・タワー', spaceport: 'ルミナ宇宙港' };
for (const r of ENEMY_REGIONS) A('combat', `region_${r}`, `${REGION_JP[r]}の掃除`, `${REGION_JP[r]}地域のモンスターを 300 体倒す`, 10, (st) => c(st, 'regionKills_' + r) >= 300);
for (const [n, p, title] of [[10, 10], [30, 20], [50, 20], [100, 40, '塔より高い塔の上で']]) {
  A('combat', `tower_${n}`, `スパイア ${n} 階`, `ヴァイス・スパイアの ${n} 階をクリア`, p, (st) => (st.tower?.best || 0) >= n, title ? { title } : {});
}

// ------------------------------------------------------------ 成長 20
for (const [n, p, title] of [[10, 5], [30, 10], [50, 10], [70, 20], [100, 20, 'ベテラン'], [150, 40], [200, 40, 'ネオン・レジェンド']]) {
  A('growth', `level_${n}`, `Lv.${n}`, `レベル ${n} に到達`, p, (st) => (st.level || 1) >= n, title ? { title } : {});
}
for (const [t, p, title] of [[1, 5], [2, 10], [3, 20], [4, 40, '頂点に立つ者']]) A('growth', `job_${t}`, `${t}次転職`, `${t}次転職を果たす`, p, (st) => (st.job?.tier || 0) >= t, title ? { title } : {});
A('growth', 'tune_first', 'はじめてのチューン', 'ネオン・チューンに成功する', 5, (st) => (st.tuneStats?.success || 0) >= 1);
for (const [n, p, title] of [[10, 10], [15, 20, 'チューナー'], [20, 40], [25, 40, '調律の極み']]) A('growth', `star_${n}`, `★${n}`, `装備を ★${n} まで強化する`, p, (st) => maxStar(st) >= n, title ? { title } : {});
A('growth', 'chip_first', 'はじめてのハック', 'ハックチップを使う', 5, (st) => (st.potStats?.tries || 0) + c(st, 'chipFirst') >= 1);
for (const [g, p, title] of [['epic', 10], ['legendary', 20], ['mythic', 40, 'コードの神']]) A('growth', `pot_${g}`, `潜在: ${g === 'epic' ? 'エピック' : g === 'legendary' ? 'レジェンダリ' : 'ミシック'}`, `潜在能力を${g === 'epic' ? 'エピック' : g === 'legendary' ? 'レジェンダリ' : 'ミシック'}にする`, p, (st) => bestPot(st) >= GRADE_ORDER[g], title ? { title } : {});

// ------------------------------------------------------------ 収集 20
for (const [n, p] of [[10, 5], [30, 10], [60, 20]]) A('collection', `book_${n}`, `図鑑 ${n} 種`, `モンスター図鑑に ${n} 種登録`, p, (st) => bookBonus(st).registered >= n);
A('collection', 'book_all', '図鑑コンプリート', 'モンスター図鑑を全種登録', 40, (st) => bookBonus(st).registered >= BOOK_IDS.length, { title: '生き字引' });
A('collection', 'book_gold_1', 'ゴールドランク', '図鑑のゴールドランクを1種達成', 10, (st) => Object.values(st.book || {}).some((k) => bookRank(k) >= 3));
A('collection', 'book_gold_10', 'ゴールドコレクター', '図鑑のゴールドランクを10種達成', 20, (st) => Object.values(st.book || {}).filter((k) => bookRank(k) >= 3).length >= 10);
A('collection', 'region_complete_1', '地域コンプ', 'いずれかの地域の図鑑をコンプリート', 10, (st) => bookBonus(st).completeRegions.length >= 1);
A('collection', 'region_complete_all', '全地域コンプ', '7地域すべての図鑑をコンプリート', 40, (st) => ENEMY_REGIONS.every((r) => bookProgress(st)[r]?.complete));
A('collection', 'rare_10', 'レアハンター', 'レア以上の装備を 10 種入手', 10, (st) => (st.rareFound || []).length >= 10);
A('collection', 'rare_30', 'お宝コレクター', 'レア以上の装備を 30 種入手', 20, (st) => (st.rareFound || []).length >= 30);
A('collection', 'mythic_1', 'ミシック！', 'ミシック装備を入手', 20, (st) => (st.rareFound || []).some((id) => ITEMS[id]?.rarity === 'mythic'));
for (const [n, p, title] of [[1, 10], [5, 20], [10, 40, 'PETマスター']]) A('collection', `pets_${n}`, `PET ${n} 匹`, `PET を ${n} 種類入手`, p, (st) => (st.rareFound || []).filter((id) => PET_IDS.includes(id)).length >= n, title ? { title } : {});
A('collection', 'visit_10', '街歩き', '10 のマップを訪れる', 5, (st) => (st.visited || []).length >= 10);
A('collection', 'visit_all', 'ヴァイス・ベイ完全踏破', '全マップを訪れる', 20, (st) => WORLD_MAP_IDS.every((id) => (st.visited || []).includes(id)), { title: '旅人' });
for (const [n, p] of [[7, 5], [28, 10], [100, 20]]) A('collection', `login_${n}`, `ログイン ${n} 日`, `ログインボーナスを累計 ${n} 日受け取る`, p, (st) => (st.login?.days || 0) >= n);
A('collection', 'pet_lv10', 'なかよし', 'PET の親密度を Lv.10 にする', 10, (st) => c(st, 'petLevel') >= 10);

// ------------------------------------------------------------ ボス 15
const BOSS_TITLES = { boss_don: 'ドンを倒した者', boss_alien: '来訪者を退けし者', boss_zenith: 'ゼニスの頂を踏んだ者' };
for (const id of BOSS_IDS) A('boss', `boss_${id}`, `${ENEMIES[id].name} 撃破`, `${ENEMIES[id].name} を倒す`, ENEMIES[id].level >= 60 ? 20 : 10, (st) => (st.book?.[id] || 0) > 0, BOSS_TITLES[id] ? { title: BOSS_TITLES[id] } : {});
A('boss', 'boss_hard', 'ハードモード', 'いずれかのボスをハードで倒す', 20, (st) => bossClears(st, 'hard') >= 1);
A('boss', 'boss_chaos', 'カオスモード', 'いずれかのボスをカオスで倒す', 40, (st) => bossClears(st, 'chaos') >= 1, { title: 'カオスバスター' });
A('boss', 'boss_practice', '予習は大事', 'ボスの練習モードに挑む', 5, (st) => c(st, 'practice') >= 1);
A('boss', 'arena_1', 'アリーナ・デビュー', 'ネオン・アリーナをクリア', 10, (st) => (st.arena?.clears || 0) >= 1);
A('boss', 'boss_fast', 'スピードラン', 'ボスを 60 秒以内に倒す（ボスモード）', 20, (st) => c(st, 'fastBoss') >= 1);
A('boss', 'boss_bighit', '一撃 10 万', 'ボスに 1 回で 100,000 ダメージ', 20, (st) => c(st, 'maxHit') >= 100000);
A('boss', 'trophy_50', 'トロフィー 50', 'ボス・トロフィーを累計 50 個獲得', 20, (st) => c(st, 'trophies') >= 50);
A('boss', 'chaos_zog', '銀河の果ての勝利', 'カオスのオーバーロード・ゾグを倒す', 40, (st) => (st.bosses?.boss_alien?.chaos?.clears || 0) >= 1, { title: 'ネオンの守護者' });

// ------------------------------------------------------------ GTA 10
// （旧: 手配度★1/★3/★5・警察ユニット撃破。警察制度の廃止で、町めぐり・デイリー・強化への投資に置き換え）
A('gta', 'towns_all', 'ヴァイス・ベイの顔', '7つの町をすべて訪れる', 5, (st) => TOWN_IDS.every((id) => (st.visited || []).includes(id)));
A('gta', 'daily_30', '常連さん', 'デイリーミッションを累計 30 回クリア', 10, (st) => c(st, 'dailyDone') >= 30);
A('gta', 'tune_spent_1m', 'チューンの常連', 'ネオン・チューンに累計 $1,000,000 使う', 10, (st) => Math.max(st.tuneStats?.spent || 0, c(st, 'tuneSpent')) >= 1000000);
A('gta', 'tune_spent_100m', 'ネオンの投資家', 'ネオン・チューンに累計 $100,000,000 使う', 20, (st) => Math.max(st.tuneStats?.spent || 0, c(st, 'tuneSpent')) >= 100000000, { title: 'ネオンの投資家' });
A('gta', 'taxi_10', 'お得意様', 'タクシーに 10 回乗る', 5, (st) => c(st, 'taxi') >= 10);
A('gta', 'followers_1000', 'ちょっと有名人', 'NeonGram のフォロワー 1,000 人', 10, (st) => (st.sns?.followers || 0) >= 1000);
A('gta', 'followers_100000', 'インフルエンサー', 'NeonGram のフォロワー 100,000 人', 40, (st) => (st.sns?.followers || 0) >= 100000, { title: 'ネオンのインフルエンサー' });
A('gta', 'money_100k', '小金持ち', '所持金 $100,000', 10, (st) => Math.max(st.money || 0, c(st, 'moneyMax')) >= 100000);
A('gta', 'money_1m', 'ミリオネア', '所持金 $1,000,000', 20, (st) => Math.max(st.money || 0, c(st, 'moneyMax')) >= 1000000);
A('gta', 'money_10m', 'ベイの大富豪', '所持金 $10,000,000', 40, (st) => Math.max(st.money || 0, c(st, 'moneyMax')) >= 10000000, { title: '大富豪' });

// ------------------------------------------------------------ 隠し 5
A('hidden', 'deaths_10', '七転び八起き', '10 回倒れる', 5, (st) => c(st, 'deaths') >= 10, { hidden: true });
A('hidden', 'town_skill_100', 'ストリート・パフォーマー', '町でスキルを 100 回使う', 5, (st) => c(st, 'townSkills') >= 100, { hidden: true, title: 'ストリート・パフォーマー' });
A('hidden', 'route_police', 'バッジの側', 'ストーリーで警察側の選択を3回する', 20, (st) => Object.values(st.storyChoices || {}).filter((v) => v === 'police').length >= 3, { hidden: true, title: 'VBPDの英雄' });
A('hidden', 'route_gang', 'ストリートの側', 'ストーリーでストリート側の選択を3回する', 20, (st) => Object.values(st.storyChoices || {}).filter((v) => v === 'street').length >= 3, { hidden: true, title: '裏通りの王' });
A('hidden', 'arena_50', 'アリーナの主', 'ネオン・アリーナを 50 回クリア', 20, (st) => (st.arena?.clears || 0) >= 50, { hidden: true });

export const ACHIEVEMENTS = Object.fromEntries(list.map((a) => [a.id, a]));
export const ACHIEVEMENT_IDS = list.map((a) => a.id);

// ------------------------------------------------------------ 称号
/** 実績以外の称号（ストーリー分岐・タワー・SNS 等）。flag が立てば所持 */
export const EXTRA_TITLES = {
  t_police_ally: { name: 'VBPDの協力者', source: 'ストーリー（第6話）', flag: 'title_police_ally' },
  t_street_face: { name: '裏通りの顔', source: 'ストーリー（第6話）', flag: 'title_street_face' },
  t_bay_hero: { name: 'ヴァイス・ベイの英雄', source: 'ストーリー（最終話）', flag: 'title_bay_hero' },
  t_new_don: { name: '新しいドン', source: 'ストーリー（最終話）', flag: 'title_new_don' },
  t_spire_100: { name: 'スパイアの頂', source: 'ヴァイス・スパイア 100階', flag: 'title_spire_100' },
};

function ensure(state) {
  const a = state.achv && typeof state.achv === 'object' ? state.achv : (state.achv = {});
  a.done ||= {}; a.counters ||= {}; a.seen ||= {};
  return a;
}
function isDone(state, id) { return !!state?.achv?.done?.[id] || !!sharedAchievements()?.[id]; }

/** achievementList(state) → [{id, cat, catName, name, desc, points, done, hidden, title, doneAt}]（隠しは未達成なら ??? 表示） */
export function achievementList(state) {
  return list.map((a) => {
    const done = isDone(state, a.id);
    const masked = a.hidden && !done;
    return {
      id: a.id, cat: a.cat, catName: ACH_CATEGORIES[a.cat], points: a.points,
      name: masked ? '？？？' : a.name, desc: masked ? '隠し実績' : a.desc,
      done, hidden: !!a.hidden, title: masked ? null : a.title || null,
      doneAt: state?.achv?.done?.[a.id] || sharedAchievements()?.[a.id] || null,
    };
  });
}

let _bonusKey = null, _bonusVal = null;
/** achievementSummary(state) → {points, total, done, count, rank, next, nextPoints, allStat} */
export function achievementSummary(state) {
  let points = 0, done = 0, total = 0;
  for (const a of list) { total += a.points; if (isDone(state, a.id)) { points += a.points; done++; } }
  let ri = 0;
  for (let i = 0; i < ACH_RANKS.length; i++) if (points >= ACH_RANKS[i].points) ri = i;
  return {
    points, total, done, count: list.length, rank: ACH_RANKS[ri].id, rankIndex: ri,
    next: ACH_RANKS[ri + 1]?.id || null, nextPoints: ACH_RANKS[ri + 1]?.points ?? null,
    allStat: ri * ACH_RANK_ALLSTAT,
  };
}
/** computeStats 用: {allStat, rank}（キャッシュ付き） */
export function achievementBonus(state) {
  const d = state?.achv?.done;
  const sh = sharedAchievements();
  const key = (d ? Object.keys(d).length : 0) + ':' + (sh ? Object.keys(sh).length : 0);
  if (key === _bonusKey && _bonusVal) return _bonusVal;
  if (!d && !sh) return { allStat: 0, rank: 'E' };
  const s = achievementSummary(state || {});
  _bonusKey = key; _bonusVal = { allStat: s.allStat, rank: s.rank };
  return _bonusVal;
}

/** titleList(state) → [{id, name, source, owned}] */
export function titleList(state) {
  const out = [];
  for (const a of list) if (a.title) out.push({ id: 'a:' + a.id, name: a.title, source: `実績「${a.name}」`, owned: isDone(state, a.id), hidden: !!a.hidden });
  for (const [id, t] of Object.entries(EXTRA_TITLES)) out.push({ id, name: t.name, source: t.source, owned: !!state?.flags?.[t.flag] });
  return out;
}
/** setTitle(state, titleId|null) → bool */
export function setTitle(state, titleId) {
  if (titleId == null) { state.title = null; return true; }
  const t = titleList(state).find((x) => x.id === titleId);
  if (!t || !t.owned) return false;
  state.title = titleId;
  return true;
}
/** currentTitle(state) → {id, name}|null（HUD 用。未選択なら最新の所持称号は自動にしない） */
export function currentTitle(state) {
  if (!state?.title) return null;
  const t = titleList(state).find((x) => x.id === state.title && x.owned);
  return t ? { id: t.id, name: t.name } : null;
}

/** addCounter(state, key, n=1) / setCounterMax(state, key, v) */
export function addCounter(state, key, n = 1) { const a = ensure(state); a.counters[key] = (a.counters[key] || 0) + n; return a.counters[key]; }
export function setCounterMax(state, key, v) { const a = ensure(state); if (!(v <= (a.counters[key] || 0))) a.counters[key] = v; return a.counters[key]; }

/** 判定（未達成のものを全て評価）。解除したものの配列を返す */
export function evaluateAchievements(game) {
  const st = game.state;
  if (!st) return [];
  const a = ensure(st);
  const got = [];
  const sh = sharedAchievements() || {};
  for (const def of list) {
    if (a.done[def.id] || sh[def.id]) continue; // 他キャラで達成済み（共有）も達成扱い
    let ok = false;
    try { ok = !!def.test(st); } catch { ok = false; }
    if (!ok) continue;
    a.done[def.id] = Date.now();
    recordSharedAchievement(def.id, a.done[def.id]);
    got.push(def);
    game.notify?.(`🏆 実績解除「${def.name}」 +${def.points}pt${def.title ? `（称号「${def.title}」）` : ''}`, '#ffd23f');
    game.events?.emit('achievementUnlocked', { id: def.id, name: def.name, points: def.points, title: def.title || null, cat: def.cat });
  }
  if (got.length) _bonusKey = null;
  return got;
}

/**
 * attachAchievements(game) — 各種イベントを購読してカウンタ更新＋判定。戻り値: 購読解除（二重 attach しない）
 */
export function attachAchievements(game) {
  if (game._achvUnsub) return game._achvUnsub;
  const ev = game.events;
  if (!ev) return () => {};
  const offs = [];
  const st = () => game.state;
  // 高頻度イベント（撃破・スキル・ヒット・コンボ）は判定を 0.25 秒に1回へまとめる（大技で多数撃破した時の1フレームの負荷対策）。
  // まとめた分は最後に必ず1回判定する（取りこぼしなし）。それ以外のイベントは即時判定。
  const FREQ = new Set(['enemyKilled', 'skillUsed', 'bossHit', 'comboTier']);
  let lastEval = -1e9, pending = null;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const evalNow = () => { lastEval = now(); if (pending) { clearTimeout(pending); pending = null; } evaluateAchievements(game); };
  const evalSoon = () => {
    if (now() - lastEval >= 250) { evalNow(); return; }
    if (!pending) pending = setTimeout(() => { pending = null; if (st()) evalNow(); }, 250);
  };
  const on = (n, fn) => offs.push(ev.on(n, (d) => { if (!st()) return; try { fn(d || {}); } finally { if (FREQ.has(n)) evalSoon(); else evalNow(); } }));
  on('enemyKilled', (d) => {
    const def = d.enemy?.def || ENEMIES[d.enemy?.defId];
    if (!def) return;
    if (def.civilian || def.isCop) return;
    if (isNight(game.clock ?? st().clock)) addCounter(st(), 'nightKills');
    if (ENEMY_REGIONS.includes(def.region)) addCounter(st(), 'regionKills_' + def.region);
  });
  on('levelUp', () => {});
  on('jobAdvanced', () => {});
  on('missionComplete', (d) => { if (MISSIONS[d.id]?.daily) addCounter(st(), 'dailyDone'); });
  on('bookNew', () => {}); on('bookRank', () => {}); on('bookComplete', () => {});
  on('rareDrop', () => {}); on('petDrop', () => {});
  on('taxiTravel', () => addCounter(st(), 'taxi'));
  on('skillUsed', () => { addCounter(st(), 'skillUses'); if (game.map?.town) addCounter(st(), 'townSkills'); });
  on('playerDied', () => addCounter(st(), 'deaths'));
  on('tuneResult', (d) => { if (d.success) setCounterMax(st(), 'maxStar', d.star || 0); if (d.cost > 0) addCounter(st(), 'tuneSpent', d.cost); });
  on('chipUsed', () => {}); on('chipApplied', () => {});
  on('potentialGradeUp', (d) => setCounterMax(st(), 'bestPot', GRADE_ORDER[d.grade] || 0));
  on('comboTier', (d) => setCounterMax(st(), 'maxCombo', d.count || 0));
  on('comboEnd', (d) => setCounterMax(st(), 'maxCombo', d.count || 0));
  on('bossClear', (d) => {
    if (d.mode === 'practice') return;
    if (d.time != null && d.time <= 60) addCounter(st(), 'fastBoss');
    if (d.trophies) addCounter(st(), 'trophies', d.trophies);
  });
  on('bossEnter', (d) => { if (d.mode === 'practice') addCounter(st(), 'practice'); });
  on('bossHit', (d) => setCounterMax(st(), 'maxHit', d.dmg || 0));
  on('towerFloorClear', () => {}); on('arenaClear', () => {});
  on('loginBonus', () => {});
  on('petLevelUp', (d) => setCounterMax(st(), 'petLevel', d.level || 0));
  on('storyChoice', () => {});
  on('snsPost', () => {});
  on('mapChanged', () => setCounterMax(st(), 'moneyMax', st().money || 0));
  on('itemSold', () => setCounterMax(st(), 'moneyMax', st().money || 0));
  evaluateAchievements(game);
  game._achvUnsub = () => { offs.forEach((f) => f?.()); if (pending) { clearTimeout(pending); pending = null; } game._achvUnsub = null; };
  return game._achvUnsub;
}
