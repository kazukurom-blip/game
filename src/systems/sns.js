// スマホSNS「NeonGram」: 行動に応じて自動投稿 → フォロワー増加 → 節目で報酬
// state.sns = {followers, posts:[{id, t, text, likes, kind, tags}], milestones:[達成済みの節目], totalLikes}
// posts は新しい順（先頭が最新）。UI は events 'snsPost' / 'snsMilestone' を購読してもよい。
import { ITEMS } from '../data/items.js';
import { ENEMIES } from '../data/enemies.js';
import { MISSIONS } from '../data/missions.js';
import { addItem } from './inventory.js';
import { newSnsState } from './progression.js';

export const SNS_MAX_POSTS = 60;
export const SNS_MILESTONES = [
  { followers: 100, money: 1000, items: ['potion_orange', 'potion_orange', 'potion_orange'], text: 'フォロワー100人突破！ ファンから差し入れが届いた' },
  { followers: 500, money: 5000, items: ['drink_lucky'], text: 'フォロワー500人！ 企業案件でラッキー・ソーダをもらった' },
  { followers: 1000, money: 15000, items: ['sunglasses_neon'], text: 'フォロワー1000人！ ブランドからネオンシェードが届いた' },
  { followers: 5000, money: 50000, items: ['elixir', 'elixir', 'elixir'], text: 'フォロワー5000人！ 街の有名人に。スポンサー報酬GET' },
  { followers: 10000, money: 150000, items: ['pet_cat'], text: 'フォロワー1万人！ 熱狂的なファンからPETが贈られた' },
];
export const SNS_TITLES = [
  [0, 'ただの旅人'], [50, '駆け出しネオングラマー'], [100, 'ご近所の有名人'], [500, 'ローカルスター'],
  [1000, 'インフルエンサー'], [5000, 'ヴァイス・ベイの顔'], [10000, 'ネオンの伝説'],
];

/** snsTitle(state) → 称号文字列（フォロワー数で決まる） */
export function snsTitle(state) {
  const f = state?.sns?.followers || 0;
  let t = SNS_TITLES[0][1];
  for (const [n, name] of SNS_TITLES) if (f >= n) t = name;
  return t;
}
/** 次の称号まで {name, need} | null */
export function snsNextTitle(state) {
  const f = state?.sns?.followers || 0;
  const nx = SNS_TITLES.find(([n]) => n > f);
  return nx ? { name: nx[1], need: nx[0] - f } : null;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const heroName = (st) => (st?.heroId === 'jin' ? 'ジン' : 'ルナ');
let _seq = 0;

function ensure(st) {
  if (!st.sns || typeof st.sns !== 'object') st.sns = newSnsState();
  if (!Array.isArray(st.sns.posts)) st.sns.posts = [];
  if (!Array.isArray(st.sns.milestones)) st.sns.milestones = [];
  st.sns.followers = st.sns.followers || 0;
  return st.sns;
}

/**
 * snsPost(game, text, {gain, kind, tags}) — 投稿してフォロワーを gain 人増やす。投稿を返す
 * likes はフォロワー数とバズ度（gain）から算出。
 */
export function snsPost(game, text, opts = {}) {
  const st = game.state;
  if (!st) return null;
  const sns = ensure(st);
  const gain = Math.max(0, Math.round(opts.gain ?? 5));
  const before = sns.followers;
  sns.followers += gain;
  const likes = Math.max(1, Math.round((before * (0.05 + Math.random() * 0.15)) + gain * (2 + Math.random() * 3)));
  const post = { id: `${Date.now().toString(36)}_${_seq++}`, t: Date.now(), clock: game.clock ?? null, text, likes, kind: opts.kind || 'post', tags: opts.tags || [], gain };
  sns.posts.unshift(post);
  if (sns.posts.length > SNS_MAX_POSTS) sns.posts.length = SNS_MAX_POSTS;
  sns.totalLikes = (sns.totalLikes || 0) + likes;
  game.events?.emit('snsPost', { post, followers: sns.followers });
  if (!opts.silent) game.notify?.(`📱 NeonGram に投稿 +${gain}フォロワー`, '#ff6fd8');
  checkMilestones(game);
  return post;
}

function checkMilestones(game) {
  const st = game.state;
  const sns = ensure(st);
  for (const m of SNS_MILESTONES) {
    if (sns.followers < m.followers || sns.milestones.includes(m.followers)) continue;
    sns.milestones.push(m.followers);
    if (m.money) st.money = (st.money || 0) + m.money;
    const got = [];
    for (const id of m.items || []) if (ITEMS[id] && addItem(game, id, 1, { silent: true })) got.push(ITEMS[id].name);
    const prevTitle = snsTitleFor(m.followers - 1);
    const title = snsTitle(st);
    game.notify?.(`🎉 ${m.text}  $${m.money}${got.length ? ' / ' + [...new Set(got)].join('・') : ''}`, '#ffd23f');
    if (title !== prevTitle) game.notify?.(`称号「${title}」を手に入れた！`, '#ff6fd8');
    game.events?.emit('snsMilestone', { followers: m.followers, money: m.money, items: m.items || [], title });
    // 運営からのお知らせ投稿（フォロワーは増やさない）
    const sys = { id: `sys_${m.followers}`, t: Date.now(), clock: game.clock ?? null, text: `【NeonGram運営】${heroName(st)}さん、${m.text.replace(/！.*/, '')}おめでとうございます！ #NeonGram公式`, likes: Math.round(m.followers * 0.3), kind: 'system', tags: ['NeonGram公式'], gain: 0 };
    sns.posts.unshift(sys);
    if (sns.posts.length > SNS_MAX_POSTS) sns.posts.length = SNS_MAX_POSTS;
  }
}
function snsTitleFor(f) { let t = SNS_TITLES[0][1]; for (const [n, name] of SNS_TITLES) if (f >= n) t = name; return t; }

// ---- 投稿テンプレート ----
const T = {
  rare: (st, it) => pick([
    `${it.name} 拾った！！ 今日の運、全部使い切った気がする✨ #レアドロップ #ヴァイスベイ`,
    `見て見て！ ${it.name} ゲット〜！ 似合う？ #今日のコーデ #NeonGram`,
    `${it.name}…これ売ったらいくらになるんだろ。いや、売らないけど。 #戦利品`,
  ]),
  pet: (st, it) => pick([
    `うそでしょ…！？ ${it.pet?.name || it.name} がついてきた！！ 一生大事にする🐾 #PET #奇跡 #神引き`,
    `【緊急】新しい家族ができました。名前は${it.pet?.name || it.name}。 #PET #うちの子 #超激レア`,
  ]),
  level: (st, lv) => pick([
    `Lv.${lv} になった！ ちょっとずつ街の空気に慣れてきた気がする #レベルアップ`,
    `${heroName(st)}、Lv.${lv} 到達。まだまだこれから！ #成長記録 #ヴァイスベイ`,
    `Lv.${lv}！ 今夜はご褒美にネオン・エナジー飲む🥤 #レベルアップ #自分にご褒美`,
  ]),
  boss: (st, def) => pick([
    `${def.name} を倒した！！ 手が震えてる… #ボス撃破 #${def.title || 'ヴァイスベイ'}`,
    `【速報】${def.name}、討伐完了。街のみんな、もう安心して🔥 #ボス撃破 #ヒーロー`,
    `${def.name} 戦、ギリギリだった…でも勝った！ #死闘 #ボス撃破`,
  ]),
  wanted: (st, lv) => pick([
    `パトカーのサイレンが鳴りやまない🚨 手配度★${lv}… #逃走中 #ヴァイスベイ`,
    `★${lv}とかマジ？ ヘリまで飛んでるんだけど #逃走中 #映画じゃない`,
    `今、街で一番有名な二人組です（悪い意味で）★${lv} #指名手配 #逃走中`,
  ]),
  mission: (st, m) => pick([
    `「${m.name}」完了！ この街での評判、また一段上がったかも #ミッション達成`,
    `仕事終わり〜。${m.name}、なかなかハードだった #ミッション達成 #ヴァイスベイ`,
  ]),
  book: (st, n, total) => pick([
    `モンスター図鑑 ${n}/${total} 種登録！ コンプまでまだまだ #モンスター図鑑`,
    `図鑑が ${n} 種になった。ヴァイス・ベイ、変な生き物多すぎ #モンスター図鑑 #生態調査`,
  ]),
  taxi: (st, name) => `タクシーで${name}へ。運転手さんの話が面白かった🚕 #移動中 #ヴァイスベイ`,
};

/**
 * attachSNS(game) — events を購読して自動投稿する。戻り値: 購読解除関数（二重 attach しない）
 *  rareDrop(エピック以上) / petDrop / levelUp(Lv5ごと・序盤は毎回) / enemyKilled(ボスのみ) /
 *  wantedChanged(★3以上に上がった時) / missionComplete / bookNew(10種ごと)
 */
export function attachSNS(game) {
  if (game._snsUnsub) return game._snsUnsub;
  const ev = game.events;
  if (!ev) return () => {};
  if (game.state) ensure(game.state);
  const offs = [];
  const on = (n, fn) => offs.push(ev.on(n, fn));
  let lastWanted = game.wanted || 0;

  on('rareDrop', (d) => {
    const it = d?.item;
    if (!it || it.slot === 'pet') return; // PET は petDrop で
    const order = { rare: 1, epic: 2, legendary: 3, mythic: 4 }[it.rarity] || 0;
    if (order < 2) return;
    snsPost(game, T.rare(game.state, it), { gain: [0, 0, 15, 60, 200][order], kind: 'rare', tags: ['レアドロップ'] });
  });
  on('petDrop', (d) => {
    const it = d?.item;
    if (!it) return;
    snsPost(game, T.pet(game.state, it), { gain: 500, kind: 'pet', tags: ['PET'] });
  });
  on('levelUp', (d) => {
    const lv = d?.level || game.state?.level || 1;
    if (lv <= 5 || lv % 5 === 0) snsPost(game, T.level(game.state, lv), { gain: Math.round(3 + lv * 1.5), kind: 'level', tags: ['レベルアップ'] });
  });
  on('enemyKilled', (d) => {
    const def = d?.enemy?.def || ENEMIES[d?.enemy?.defId];
    if (!def?.boss) return;
    snsPost(game, T.boss(game.state, def), { gain: Math.round(40 + def.level * 6), kind: 'boss', tags: ['ボス撃破'] });
  });
  on('wantedChanged', (d) => {
    const lv = d?.level ?? 0;
    if (lv >= 3 && lv > lastWanted) snsPost(game, T.wanted(game.state, lv), { gain: lv * 12, kind: 'wanted', tags: ['逃走中'] });
    lastWanted = lv;
  });
  on('missionComplete', (d) => {
    const m = MISSIONS[d?.id];
    if (!m || m.daily) return;
    snsPost(game, T.mission(game.state, m), { gain: m.category === 'main' ? 25 + (m.reqLevel || 1) : 10, kind: 'mission', tags: ['ミッション達成'] });
  });
  on('bookNew', (d) => {
    const n = d?.count || 0;
    if (n > 0 && n % 10 === 0) snsPost(game, T.book(game.state, n, d.total || n), { gain: 20 + n, kind: 'book', tags: ['モンスター図鑑'] });
  });
  on('taxiTravel', (d) => {
    if (Math.random() < 0.3) snsPost(game, T.taxi(game.state, d?.name || d?.mapId), { gain: 2, kind: 'taxi', silent: true });
  });

  game._snsUnsub = () => { offs.forEach((f) => f?.()); game._snsUnsub = null; };
  return game._snsUnsub;
}
