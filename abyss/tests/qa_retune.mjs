// 手応えの見直し（ユーザーの声「敵が弱すぎる・アイテムも出すぎる・ヌルゲー」）の確かめ。Node だけで動く。実行: node tests/qa_retune.mjs
// 敵の強さの曲線・敵の狙いと足・古いセーブ（版 3）・放置の稼ぎ（古い速さを使わない・経験値の Lv 差）・幸運ゲージの天井。
import { Game } from '../src/game/game.js';
import { BAL } from '../src/data/balance.js';
import { migrate, SAVE_VERSION } from '../src/game/state.js';
import { LUCK } from '../src/game/content/items/rewards.js';
import { BAL_STAMP } from '../src/game/systems/offline.js';

let pass = 0; let fail = 0;
function t(name, fn) {
  try { const r = fn(); if (r === false) throw new Error('false'); pass++; } catch (e) { fail++; console.log(`✘ ${name}: ${e.stack?.split('\n').slice(0, 3).join(' | ') || e.message}`); }
}
const ok = (c, m = '') => { if (!c) throw new Error(m || 'not ok'); };
const eq = (a, b, m = '') => { if (a !== b) throw new Error(`${m} ${a} !== ${b}`); };
const near = (a, b, tol, m = '') => { if (Math.abs(a - b) > tol) throw new Error(`${m} ${a} ≉ ${b}`); };
const errors = [];
const origErr = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); };

function fresh(cls = 'warrior', seed = 11) { const g = new Game({ seed }); g.newGame(cls, 'テスト'); return g; }
function run(g, sec) { for (let i = 0; i < sec * 20; i++) g.tick(0.05); }

// ---------------- 敵の強さの曲線
t('敵の強さ: 序盤は ×2.5・×1.6、Lv42 で ×1.3・×1.12、Lv70 から ×1（魔境・裂け目も ×1）', () => {
  const d = (L) => BAL.difficultyAt(L);
  near(d(1).life, 2.5, 1e-9); near(d(12).dmg, 1.6, 1e-9);
  near(d(42).life, 1.3, 1e-9); near(d(42).dmg, 1.12, 1e-9);
  near(d(70).life, 1, 1e-9); near(d(130).life, 1, 1e-9); near(d(130).dmg, 1, 1e-9);
  // なめらかに下がる（途中で上がらない）
  for (let L = 1; L < 120; L++) ok(d(L + 1).life <= d(L).life + 1e-12 && d(L + 1).dmg <= d(L).dmg + 1e-12, `Lv${L}`);
  // 足の速さは終盤も 3 割残す
  near(d(1).speed, BAL.MONSTER_SPEED, 1e-9); ok(d(100).speed > 1 && d(100).speed < d(1).speed, `${d(100).speed}`);
  eq(BAL.monsterLife(1), 15 * 2.5 * 10, '最初の敵のライフ');
});

// ---------------- 敵の狙いと足
t('攻撃 ×0 で出した敵はダメージを与えない（以前は ×1 になっていた）', () => {
  const g = fresh('warrior', 3);
  const c = g.combat; c.clearEnemies();
  const u = c.spawnMonster('rot_zombie', { level: 5, x: c.hero.x + 60, dmgMul: 0 });
  eq(u.dmg, 0);
});
t('動かない敵（呪いの柱 speed 0）は歩かない。ため込み屋は今まで通りの足', () => {
  const g = fresh('warrior', 3);
  const c = g.combat; c.clearEnemies();
  const tot = c.spawnMonster('totem_ward', { level: 5, x: c.hero.x + 600 });
  eq(tot.speed, 0, '柱');
  const x0 = tot.x;
  for (let i = 0; i < 40; i++) c.tick(0.05);
  ok(tot.x >= x0 - 1e-6, `柱が主人公へ歩いた ${x0} → ${tot.x}`); // 当たって押し返されるのはよい
  const gb = c.spawnMonster('goblin_gold', { level: 5, rank: 'goblin', x: c.hero.x + 1500 });
  ok(gb.speed > 0, `ため込み屋 ${gb.speed}`);
});
t('遠くから撃つ敵は主人公を狙う。ただし引きつける召喚物（巨像・猪）が近ければそちら。呼び出し役は今まで通り', () => {
  const g = fresh('necromancer', 3);
  const c = g.combat; const h = c.hero; c.clearEnemies();
  const archer = c.spawnMonster('bone_archer', { level: 5, x: h.x + 500 });
  const minion = { id: 99901, team: 'hero', kind: 'minion', x: h.x + 200, y: 0, dead: false, taunt: false };
  c.units.push(minion);
  eq(c.targetFor(archer), h, '撃つ敵は召喚物の陰の主人公を狙う');
  minion.taunt = true;
  eq(c.targetFor(archer), minion, '引きつける召喚物が勝つ');
  minion.taunt = false;
  const summoner = c.spawnMonster('bog_witch', { level: 5, x: h.x + 500 });
  ok(summoner.isSummoner, '呼び出し役');
  eq(c.targetFor(summoner), minion, '呼び出し役は近い召喚物を狙う');
});

// ---------------- 古いセーブ（版 3）
t('版 2 のセーブ: 自動装備がオンになり、一度だけ知らせる。新しいセーブは知らせない', () => {
  ok(SAVE_VERSION >= 3);
  const g = fresh('warrior', 4);
  const st = JSON.parse(JSON.stringify(g.snapshot()));
  st.version = 2; st.inv.filter.autoEquip = false;
  const m = migrate(st);
  eq(m.inv.filter.autoEquip, true, '自動装備');
  ok(m.meta.updateNotes.includes('v3'), '知らせ');
  const again = migrate(JSON.parse(JSON.stringify({ ...m, meta: { ...m.meta, updateNotes: [] } })));
  eq(again.meta.updateNotes.length, 0, '2 回目は知らせない');
  const n = migrate(JSON.parse(JSON.stringify(fresh('ranger', 5).snapshot())));
  ok(!(n.meta.updateNotes || []).length, '新しいセーブ');
});

// ---------------- 放置の稼ぎ
t('放置: セーブに残った「見直しの前の稼ぎの速さ」は使わない（同じ決まりで測った物だけ）', () => {
  const g = fresh('warrior', 6);
  run(g, 60);
  const st = JSON.parse(JSON.stringify(g.snapshot()));
  st.meta.rates = { kills: 2, xp: 1e6, gold: 1e6, drops: 0.25, elites: 0.1, bosses: 0, level: 3, measured: 600 }; // 古い版（bal が無い）
  const g2 = new Game({ seed: 6 }); g2.load(st);
  const r = g2.sys.offline.rates();
  ok(r.drops < 0.1 && r.xp < 1e6, `古い速さを使った ${JSON.stringify(r)}`);
  eq(r.bal, BAL_STAMP);
  // 同じ決まりで測った物は使う
  const st2 = JSON.parse(JSON.stringify(g.snapshot()));
  const g3 = new Game({ seed: 6 }); g3.load(st2);
  near(g3.sys.offline.rates().drops, g.sys.offline.rates().drops, 1e-9, '今の版の速さ');
});
t('放置: 経験値は 1 Lv ずつ Lv 差の補正をかけ直す（地域より上がりすぎた分は減る）', () => {
  const g = fresh('warrior', 7);
  const h = g.state.hero;
  h.level = 12; h.xp = 0;
  const r = { xp: 1.5 * BAL.monsterXp(10), level: 10, heroLevel: 12 }; // Lv10 の敵を 1 秒に 1.5 体
  // 補正なしなら 8 時間で何 Lv になるか
  let lv = 12; let xp = r.xp * 8 * 3600;
  while (lv < BAL.MAX_LEVEL && xp >= BAL.xpToNext(lv)) { xp -= BAL.xpToNext(lv); lv++; }
  g.sys.offline.grantXp(r, 8 * 3600);
  ok(h.level < lv, `補正なし Lv${lv} / 実際 Lv${h.level}`);
  ok(h.level - r.level <= 8, `地域より ${h.level - r.level} Lv 上`);
  // 地域より下: 追い上げ（+15%/Lv）は、追いつくほど小さくなる。最初の速さ × 時間と、最後のレベルの速さ × 時間の間に入る
  const g2 = fresh('warrior', 7); g2.state.hero.level = 5; g2.state.hero.xp = 0;
  const xp2 = g2.sys.offline.grantXp({ xp: 50, level: 10, heroLevel: 5 }, 600);
  const lo = 50 * 600 * BAL.xpLevelPenalty(g2.state.hero.level, 10) / BAL.xpLevelPenalty(5, 10);
  ok(xp2 <= 50 * 600 + 1e-6 && xp2 >= lo - 1e-6, `${xp2.toFixed(0)}（${lo.toFixed(0)}〜${50 * 600}）`);
});

// ---------------- 幸運ゲージ
t('幸運ゲージの天井はドロップ率に合わせて下げた（レジェンダリー以上 120 回・ミシック 6,000 回）', () => {
  eq(LUCK.leg.max, 120); eq(LUCK.myth.max, 6000);
  // 序盤の振る回数（1 時間）で天井までおよそ 30〜60 分
  const g = fresh('warrior', 8);
  run(g, 600);
  const perH = g.state.inv.luck.rolls * 6;
  const mins = LUCK.leg.max / perH * 60;
  ok(mins > 15 && mins < 120, `1 時間に ${perH} 回 → 天井まで ${mins.toFixed(0)} 分`);
});

console.error = origErr;
if (errors.length) console.log('console.error:', errors.slice(0, 5));
console.log(`\nqa_retune: ${pass} 通過 / ${fail} 失敗`);
process.exit(fail || errors.length ? 1 : 0);
