// 機能を少しずつ開く（REFERENCE U02）。最初は 装備・持ち物・スキル・地図・その他 だけ。
// 条件を満たすと「新しい機能」の知らせを出し、タブに NEW が付く。初めて開いたときは窓の上に短い説明を出す。
// 記録は state.meta.tutorial（unlocked: { id: 遊んだ秒 }, opened: { id: true }＝タブを開いた（NEW が消える）, seen: { id: true }＝説明を読んだ）。一度開いた機能は閉じない。
// 設定の「機能を少しずつ開く」を OFF にすると、すべて最初から見える（state.settings.progressive === false）。

import { h, button } from './dom.js';

const lvl = (g) => g.state.hero.level || 1;
const found = (g, ...r) => r.some((id) => (g.state.meta.stats?.itemsFound?.[id] || 0) > 0);
const hasAny = (o) => !!o && Object.values(o).some((v) => (Array.isArray(v) ? v.length : v) > 0);
function anySocket(g) {
  const items = [...(g.state.inv.bag || []), ...Object.values(g.state.hero.equip || {})];
  return items.some((it) => it?.sockets?.length);
}

/**
 * 開く機能。when は「いつ開くか」の短い説明（次の目標・設定の一覧に出る）。
 * intro は初めて開いたときの説明（1〜3 文）。
 */
export const FEATURES = [
  { id: 'tree', name: 'パッシブ', when: 'Lv 2', cond: (g) => lvl(g) >= 2,
    intro: 'レベルが上がるたびに星座盤の点がもらえます。点を押すと、振ってある所から一番近い道で振れます。Lv 30 までは振り直しも無料です。' },
  { id: 'achievements', name: '実績', when: 'Lv 3 か、はじめての実績', cond: (g) => lvl(g) >= 3 || hasAny(g.state.meta.achievements),
    intro: '遊んでいるだけで自然に達成できます。実績ポイントは全ダメージ・ライフ・ゴールドなどを少しずつ上げ続けます。称号も選べます。' },
  { id: 'craft', name: '鍛冶', when: 'Lv 5 か、はじめてのレア', cond: (g) => lvl(g) >= 5 || found(g, 'rare', 'epic', 'legendary', 'set', 'unique', 'mythic'),
    intro: '分解で集めた素材で装備を鍛えます。まずは武器の「強化」（+1〜+20）がおすすめ。失敗しても壊れず、下がりません。' },
  { id: 'bestiary', name: '図鑑', when: 'Lv 6', cond: (g) => lvl(g) >= 6,
    intro: '倒した魔物が登録されます。同じ魔物をたくさん倒すと段が上がり、その種族へのダメージが増えます。落とし物の表もここにあります。' },
  { id: 'bounties', name: '日課', when: 'Lv 8', cond: (g) => lvl(g) >= 8,
    intro: '毎日 3 つの日課と、毎週の大きな目標です。放置しているだけで進みます。ログインの贈り物もここで受け取ります。' },
  { id: 'stats', name: '記録', when: 'Lv 10', cond: (g) => lvl(g) >= 10,
    intro: 'これまでの記録と、能力がどこから来ているかの内訳、スキルごとのダメージが見られます。' },
  { id: 'merchant', name: '商人', when: 'はじめての深淵の欠片（エリートが落とす）', cond: (g) => (g.state.inv.mats?.shard || 0) > 0 || lvl(g) >= 15,
    intro: '深淵の欠片で、部位を選んで品物を買えます（中身はレア以上）。極致の核を集めると、好きなミシックと交換できます。' },
  { id: 'gems', name: '宝石', when: 'はじめての宝石かソケット', cond: (g) => hasAny(g.state.inv.gems) || hasAny(g.state.inv.runes) || anySocket(g) || lvl(g) >= 18,
    intro: 'ソケットの空いた装備に宝石やルーンをはめます。同じ宝石 3 つでひとつ上の段に合成できます。' },
  { id: 'codex', name: '極意', when: 'はじめてのレジェンダリー', cond: (g) => found(g, 'legendary', 'set', 'unique', 'mythic') || hasAny(g.state.meta.codex?.powers) || lvl(g) >= 25,
    intro: 'レジェンダリーから伝説の力を抜き出して登録し、装備に付いていなくても 3 つまで着けられます（抜き出した装備は消えます）。' },
  { id: 'pets', name: 'ペット', when: 'はじめての卵（エリート・ボスがまれに落とす）', cond: (g) => (g.sys.pets?.eggCount?.() || 0) > 0 || hasAny(g.state.meta.pets?.owned) || (g.state.meta.pets?.incubator?.length || 0) > 0,
    intro: '卵を孵卵器に入れると、戦うほど育って孵ります。1 匹を連れて歩けて、持っているだけで効く効果もあります。' },
  { id: 'prestige', name: '転生', when: '第五章のボスを倒す', cond: (g) => !!g.sys.prestige?.isUnlocked?.() || !!g.state.meta.unlocks?.prestige || (g.state.meta.rebirths || 0) > 0,
    intro: '物語の進みとお金を手放して魂を得ます。レベル・装備・星座盤などは残ります。魂は魂の祭壇で永続の強化と自動化に使います。' },
  { id: 'rift', name: '裂け目', when: '物語の最後（第十章の深淵王）を倒す', cond: (g) => !!g.sys.rift?.available?.(),
    intro: '物語のあとの終わりのない挑戦です。深淵の裂け目は段階に上限がなく、魔境（I〜XVI）は物語の地域を強くした難しさです。' },
];
export const FEATURE = Object.fromEntries(FEATURES.map((f) => [f.id, f]));

export function tutorialOf(state) {
  const T = (state.meta.tutorial ||= { step: 0, done: {} });
  T.unlocked ||= {};
  T.opened ||= {};
  T.seen ||= {};
  return T;
}

const progressive = (g) => g.state?.settings?.progressive !== false;

/** その窓のタブを出してよいか */
export function isOpen(game, id) {
  if (!FEATURE[id] || !game.state || !progressive(game)) return true;
  return !!tutorialOf(game.state).unlocked[id];
}

/** 開いたが、まだ見ていない */
export function isNew(game, id) {
  if (!FEATURE[id] || !game.state || !progressive(game)) return false;
  const T = tutorialOf(game.state);
  return !!T.unlocked[id] && !T.opened[id] && !T.seen[id];
}

/** 次に開く機能（次の目標の欄で使う） */
export function nextFeature(game) {
  if (!progressive(game)) return null;
  const T = tutorialOf(game.state);
  return FEATURES.find((f) => !T.unlocked[f.id]) || null;
}

/** 条件を見て開く。silent なら知らせを出さず、見たことにする（前からのセーブ・始めた直後） */
export function checkUnlocks(ui, silent = false) {
  const g = ui.game;
  if (!g.state) return [];
  const T = tutorialOf(g.state);
  const opened = [];
  for (const f of FEATURES) {
    if (T.unlocked[f.id]) continue;
    let ok = false;
    try { ok = !!f.cond(g); } catch (e) { console.error(e); }
    if (!ok) continue;
    T.unlocked[f.id] = Math.round(g.state.playTime || 0);
    if (silent) { T.seen[f.id] = true; T.opened[f.id] = true; }
    opened.push(f);
  }
  if (opened.length && !silent && progressive(g)) {
    const f = opened[0];
    ui.toast(opened.length === 1 ? `✨ 新しい機能「${f.name}」が開いた（タブに NEW）` : `✨ 新しい機能が ${opened.length} つ開いた（「${f.name}」ほか）`, 'feature');
    g.events.emit('featureUnlocked', { ids: opened.map((x) => x.id) });
  }
  return opened;
}

/** すべて開く（テスト・上級者向け） */
export function unlockAll(game) {
  const T = tutorialOf(game.state);
  for (const f of FEATURES) { T.unlocked[f.id] ??= Math.round(game.state.playTime || 0); T.seen[f.id] = true; T.opened[f.id] = true; }
}

/** 説明を読んだことにする（わかった・ほかの窓へ移った） */
export function markSeen(game, id) {
  if (!FEATURE[id] || !game.state) return;
  tutorialOf(game.state).seen[id] = true;
}

/**
 * 窓を描くとき: 開いていない機能でも、ゲームの中のつながり（ボタン）から来たなら開いたことにする。
 * 説明を読むまで（わかった を押すか、ほかの窓へ移るまで）は、描き直しても説明の欄を返す。
 */
export function introFor(ui, id) {
  const g = ui.game;
  const f = FEATURE[id];
  if (!f || !g.state) return null;
  const T = tutorialOf(g.state);
  T.unlocked[id] ??= Math.round(g.state.playTime || 0);
  T.opened[id] = true;
  if (T.seen[id] || !progressive(g)) { T.seen[id] = true; return null; }
  const box = h('div.feature-intro', { role: 'note' }, [
    h('div.fi-head', [h('span.fi-tag', '新しい機能'), h('b', f.name)]),
    h('p', f.intro),
    h('div.fi-btns', [
      ui.current?.help ? button('くわしく', () => ui.showHelp(), { kind: 'small' }) : null,
      button('わかった', () => { T.seen[id] = true; box.remove(); }, { kind: 'small', class: 'fi-ok' }),
    ]),
  ]);
  return box;
}
