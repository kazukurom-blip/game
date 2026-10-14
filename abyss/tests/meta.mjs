// メタ担当の仕組みの確かめ（転生・実績・図鑑・日課・ペット・放置）。Node だけで動く。実行: node tests/meta.mjs
import { Game } from '../src/game/game.js';
import { computeHero } from '../src/game/character.js';
import { statDef } from '../src/data/stats.js';
import { ALTAR, STAR_UPGRADES, PRESTIGE, baseSouls, starsFor } from '../src/data/prestige.js';
import { ACHIEVEMENTS, TITLES, TITLE, POINT_BONUS } from '../src/data/achievements.js';
import { PETS, EGGS, PET_BAL } from '../src/data/pets.js';
import { MONSTERS } from '../src/data/monsters.js';
import { ZONES } from '../src/data/world.js';
import { generateItem } from '../src/game/loot.js';
import { RNG } from '../src/engine/rng.js';
import { localDay } from '../src/game/systems/bounties.js';
import { rarityOddsFallback, tierOfCount } from '../src/game/systems/bestiary.js';
import { migrate } from '../src/game/state.js';

let pass = 0; let fail = 0;
function t(name, fn) {
  try { const r = fn(); if (r === false) throw new Error('false'); pass++; } catch (e) { fail++; console.log(`✘ ${name}: ${e.stack?.split('\n').slice(0, 3).join(' | ') || e.message}`); }
}
const eq = (a, b, m = '') => { if (a !== b) throw new Error(`${m} ${a} !== ${b}`); };
const ok = (c, m = '') => { if (!c) throw new Error(m || 'not ok'); };
const near = (a, b, eps = 1e-6, m = '') => { if (Math.abs(a - b) > eps) throw new Error(`${m} ${a} ≉ ${b}`); };

function fresh(cls = 'warrior', seed = 11) { const g = new Game({ seed }); g.newGame(cls, 'テスト'); return g; }
function run(g, sec) { for (let i = 0; i < sec * 20; i++) g.tick(0.05); }
const BODIES = ['biped', 'brute', 'caster', 'quad', 'beast_large', 'flyer', 'blob', 'serpent', 'spider', 'insect', 'ghost', 'golem', 'dragon', 'plant', 'aquatic', 'demon', 'elemental', 'construct'];
const FEATURES = ['horns', 'wings', 'tail', 'crown', 'armor', 'staff', 'shield', 'sword', 'axe', 'bow', 'spikes', 'tentacles', 'glow', 'hood', 'mask', 'chains', 'crystals', 'gears', 'flames', 'ice', 'bones'];

// ---------------- データ
t('祭壇の強化は 40 以上・id が重ならない', () => { ok(ALTAR.length >= 40, `${ALTAR.length}`); eq(new Set(ALTAR.map((u) => u.id)).size, ALTAR.length); });
t('実績は 150 以上・id が重ならない', () => { ok(ACHIEVEMENTS.length >= 150, `${ACHIEVEMENTS.length}`); eq(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length); });
t('実績の称号はすべてある・すべての称号が手に入る', () => { for (const a of ACHIEVEMENTS) if (a.title) ok(TITLE[a.title], a.title); const used = new Set(ACHIEVEMENTS.map((a) => a.title)); for (const ti of TITLES) ok(used.has(ti.id), ti.id); });
t('ペットは 20 種・体と飾りは決まりの中', () => { eq(PETS.length, 20); for (const p of PETS) { ok(BODIES.includes(p.body), p.body); for (const f of p.features || []) ok(FEATURES.includes(f), f); ok(p.palette?.main && p.palette?.sub && p.palette?.eye, p.id); } });
t('効果の能力はすべて定義済み', () => {
  const mods = [...ALTAR.flatMap((u) => u.mods.map((m) => m.s)), ...STAR_UPGRADES.flatMap((u) => u.mods.map((m) => m.s)), ...POINT_BONUS.map((b) => b.s), ...TITLES.flatMap((x) => x.mods.map((m) => m.s)), ...PETS.flatMap((p) => [...p.bonus, ...p.perLevel, ...p.own].map((m) => m.s))];
  for (const s of mods) ok(!statDef(s).unknown, s);
});
t('魂の式', () => { eq(baseSouls(20), 0); eq(baseSouls(49), Math.floor(PRESTIGE.SOUL_K * (29 / PRESTIGE.SOUL_DIV) ** PRESTIGE.SOUL_POW)); eq(starsFor(1000), Math.floor(2 * Math.sqrt(40))); });
t('卵の天井と確率', () => { ok(PET_BAL.PITY >= 600 && PET_BAL.PITY <= 1200); ok(PET_BAL.EGG_CHANCE.champion >= 1 / 450 && PET_BAL.EGG_CHANCE.champion <= 1 / 150); eq(EGGS.length, 3); });

// ---------------- 転生
t('転生: 解放前はできない・解放すると魂の見込みが出る', () => {
  const g = fresh();
  const ps = g.sys.prestige;
  ok(!ps.isUnlocked());
  ok(!ps.canRebirth().ok);
  // 第五章のボスを倒した知らせ（地域のデータが足りなくても動く）
  g.events.emit('zoneClear', { zone: { global: PRESTIGE.UNLOCK_ZONE, id: 'x' }, first: true });
  ok(ps.isUnlocked());
  g.state.meta.prestige.life.maxLevel = 49;
  eq(ps.previewSouls(), baseSouls(49));
  ok(ps.nextSoulLevel() > 49);
});
t('転生: 魂を得て、進みとお金が戻り、レベルと装備は残る', () => {
  const g = fresh();
  run(g, 60);
  const ps = g.sys.prestige; const st = g.state;
  st.meta.prestige.unlocked = true;
  st.meta.prestige.life.maxLevel = 60;
  st.meta.gold = 12345;
  st.hero.level = 40;
  st.world.maxZone = Math.min(4, ZONES.length - 1);
  const items = st.inv.bag.length; const eqW = st.hero.equip.weapon?.uid;
  const gain = ps.previewSouls();
  const r = ps.rebirth();
  ok(r.ok, r.msg);
  eq(st.meta.souls, gain); eq(st.meta.rebirths, 1); eq(st.meta.gold, 0);
  eq(st.hero.level, 40); eq(st.inv.bag.length, items); eq(st.hero.equip.weapon?.uid, eqW);
  eq(st.world.maxZone, Math.floor(Math.min(4, ZONES.length - 1) * 0.5));
  eq(st.meta.prestige.life.maxLevel, 0);
  eq(st.meta.prestige.history.length, 1);
  // すぐの 2 回目はできない（20 分）
  st.meta.prestige.life.maxLevel = 60;
  ok(!ps.canRebirth().ok);
  st.playTime += PRESTIGE.MIN_LIFE_SEC + 1;
  ok(ps.canRebirth().ok);
});
t('祭壇: 買うと能力が上がり、費用が増える', () => {
  const g = fresh(); const ps = g.sys.prestige; const st = g.state;
  st.meta.souls = 1000;
  const before = computeHero(st, g).more;
  const c0 = ps.cost('soul_blade');
  eq(ps.buy('soul_blade', 1), 1);
  ok(ps.cost('soul_blade') > c0);
  near(computeHero(st, g).more, before * 1.05, 1e-9, 'more');
  const n = ps.buy('soul_fury', Infinity);
  ok(n > 5, `${n}`);
  ok(st.meta.souls < ps.cost('soul_fury'));
  ok(computeHero(st, g).S.inc_dmg >= n * 10);
});
t('祭壇: 自動化・放置・鞄・速度の旗', () => {
  const g = fresh(); const ps = g.sys.prestige; const st = g.state;
  st.meta.souls = 1e6;
  ps.buy('auto_boss'); ok(st.meta.unlocks.autoBoss === true);
  ps.setToggle('autoBoss', false); ok(st.meta.unlocks.autoBoss === false);
  ps.setToggle('autoBoss', true);
  ps.buy('idle_cap', 3); eq(g.sys.offline.capHours(), 14);
  ps.buy('idle_dream', 20); near(g.sys.offline.baseEfficiency(), 1);
  const bag = st.inv.bagSize; ps.buy('idle_bag', 2); eq(st.inv.bagSize, bag + 20);
  ps.buy('idle_speed', 2); eq(st.meta.unlocks.speed, 2);
  ps.buy('idle_slot'); eq(g.sys.skills.barSize(), 6);
  ok(ps.reqProblem('auto_rebirth'), '転生 3 回が必要');
  st.meta.rebirths = 3; ok(!ps.reqProblem('auto_rebirth'));
});
t('節目で自動化がただで解放（ボスに負けた・バッグが半分）・裂け目の中では転生しない', () => {
  const g = fresh(); const st = g.state; const ps = g.sys.prestige;
  ok(!st.meta.unlocks.autoBoss);
  g.events.emit('bossFail', { reason: 'test' });
  ok(st.meta.unlocks.autoBoss === true); ok(st.meta.prestige.freeUnlocks.auto_boss);
  while (st.inv.bag.length < st.inv.bagSize / 2) st.inv.bag.push({ uid: 900000 + st.inv.bag.length, rarity: 'common', slot: 'ring', base: 'ring_1', ilvl: 1, affixes: [], sockets: [] });
  g.events.emit('invChanged', {});
  eq(ps.level('auto_salvage'), 1);
  st.meta.prestige.unlocked = true; st.meta.prestige.life.maxLevel = 70;
  ok(ps.canRebirth().ok);
  st.world.mode = 'rift'; ok(!ps.canRebirth().ok); st.world.mode = 'campaign';
});
t('自動の修練: スキルポイントを自動で振る', () => {
  const g = fresh(); const st = g.state;
  st.meta.souls = 100; g.sys.prestige.buy('auto_skill');
  st.hero.level = 10; st.hero.skillPoints = 4;
  run(g, 3);
  eq(st.hero.skillPoints, 0);
});
t('自動転生: 決めた魂に届くと転生する', () => {
  const g = fresh(); const ps = g.sys.prestige; const st = g.state;
  st.meta.prestige.unlocked = true; st.meta.rebirths = 3; st.meta.souls = 100;
  ps.buy('auto_rebirth');
  ps.setAutoRebirth(true, 10);
  st.meta.prestige.life.maxLevel = 80; st.playTime += PRESTIGE.MIN_LIFE_SEC + 5;
  run(g, 6);
  eq(st.meta.rebirths, 4);
});
t('超越: 魂と祭壇を手放して星晶。自動化は残る', () => {
  const g = fresh(); const ps = g.sys.prestige; const st = g.state; const p = st.meta.prestige;
  p.unlocked = true; st.meta.rebirths = 5; st.meta.souls = 500;
  ps.buy('soul_blade', 3); ps.buy('auto_boss');
  p.soulsSinceTrans = 1000;
  const n = ps.starsPreview();
  eq(n, starsFor(1000));
  const r = ps.transcend();
  ok(r.ok, r.msg);
  eq(p.stars, n); eq(st.meta.souls, 0); eq(ps.level('soul_blade'), 0); eq(ps.level('auto_boss'), 1);
  ok(ps.buyStar('star_blade')); eq(ps.starLevel('star_blade'), 1);
  near(computeHero(st, g).more, 1.25, 1e-9);
});

// ---------------- 実績
t('実績: 数が届くと達成・ポイントと効果・知らせ', () => {
  const g = fresh(); const st = g.state; const sys = g.sys.achievements;
  const got = [];
  g.events.on('achievement', (e) => got.push(e.def.id));
  st.meta.stats.kills = 1000;
  sys.check();
  ok(st.meta.achievements.kills_1 && st.meta.achievements.kills_2);
  ok(!st.meta.achievements.kills_3);
  ok(got.includes('kills_1'));
  ok(sys.points() >= 15);
  const H = computeHero(st, g);
  ok(H.mods.some((m) => m.src === 'achievements' && m.s === 'inc_dmg'));
  eq(sys.progress(ACHIEVEMENTS.find((a) => a.id === 'kills_3')).cur, 1000);
});
t('実績: 称号を選ぶと効果が効く', () => {
  const g = fresh(); const st = g.state; const sys = g.sys.achievements;
  ok(!sys.setTitle('title_novice'));
  st.hero.level = 10; sys.check();
  ok(sys.titles().some((x) => x.id === 'title_novice'));
  ok(sys.setTitle('title_novice'));
  ok(computeHero(st, g).mods.some((m) => m.src === 'title' && m.s === 'xp_bonus'));
});
t('実績: 秘密・好奇心（窓を開く）', () => {
  const g = fresh(); const st = g.state;
  for (let i = 0; i < 15; i++) g.events.emit('panelOpen', { id: `p${i}` });
  g.sys.achievements.check();
  ok(st.meta.achievements.secret_curious);
});
t('実績: 遊んでいるうちに自然に達成する', () => {
  const g = fresh('ranger', 3);
  run(g, 600);
  ok(Object.keys(g.state.meta.achievements).length >= 5, `${Object.keys(g.state.meta.achievements).length}`);
});

// ---------------- 図鑑
t('魔物図鑑: 段と種族へのダメージ', () => {
  const g = fresh(); const st = g.state; const sys = g.sys.bestiary;
  eq(tierOfCount(9), 0); eq(tierOfCount(10), 1); eq(tierOfCount(10000), 4);
  const m = MONSTERS.find((x) => x.family === 'beast');
  st.meta.bestiary[m.id] = 1000;
  sys.ver++;
  const H = computeHero(st, g);
  ok((H.S['family_dmg:beast'] || 0) >= 3, `${H.S['family_dmg:beast']}`);
  ok(sys.speciesCount() >= 1);
});
t('魔物図鑑: 戦うと数が増え、段の知らせが出る', () => {
  const g = fresh(); let tiers = 0; let news = 0;
  g.events.on('bestiaryTier', () => tiers++); g.events.on('bestiaryNew', () => news++);
  run(g, 120);
  ok(news >= 2, `new ${news}`); ok(tiers >= 1, `tier ${tiers}`);
});
t('宝物図鑑: 初めて拾うと登録（重ねても 1 回）', () => {
  const g = fresh(); const st = g.state; let n = 0;
  g.events.on('collectionFind', () => n++);
  const it = { uid: 999999, rarity: 'unique', uniqueId: 'u_test', slot: 'ring', base: 'ring_1', ilvl: 10, affixes: [], sockets: [] };
  g.sys.bestiary.onFound(it); g.sys.bestiary.onFound(it);
  ok(st.meta.collection.uniques.u_test); eq(n, 1);
});
t('落とし物の表: 確率の合計が 1・レア発見率で上が増える', () => {
  const a = rarityOddsFallback({ mf: 0 }); const b = rarityOddsFallback({ mf: 300 });
  near(Object.values(a).reduce((s, v) => s + v, 0), 1, 1e-9);
  ok(b.legendary > a.legendary);
  const boss = rarityOddsFallback({ rank: 'boss' }); ok(boss.legendary > a.legendary);
  const g = fresh(); const r = g.sys.bestiary.rarityOdds({ mf: 50, rank: 'champion' }); near(Object.values(r).reduce((s, v) => s + v, 0), 1, 1e-9);
});

// ---------------- 日課
function withDay(g, d) { g.sys.bounties.nowFn = () => d; }
t('日課: 日付で決まり、普段の遊びで進み、受け取れる', () => {
  const g = fresh(); const sys = g.sys.bounties; const st = g.state;
  const d = new Date(2026, 9, 14, 12);
  withDay(g, d); st.meta.bounties.day = ''; st.meta.bounties.list = []; sys.refresh();
  const types = sys.list().map((b) => b.type);
  eq(types.length, 3);
  const g2 = fresh('sorcerer', 99); withDay(g2, d); g2.state.meta.bounties.day = ''; g2.state.meta.bounties.list = []; g2.sys.bounties.refresh();
  eq(g2.sys.bounties.list().map((b) => b.type).join(), types.join(), '同じ日なら同じ種類');
  const b = sys.list()[0];
  // 数え上げを進める
  st.meta.stats.kills += 1e7; st.meta.stats.elites += 1e6; st.meta.stats.bosses += 1e4; st.meta.stats.salvaged += 1e6; st.meta.stats.goldEarned += 1e15;
  st.meta.record.stages += 1e5; st.meta.record.crafted += 1e4; st.meta.record.actKills = Object.fromEntries(['act1', 'act2', 'act3', 'act4', 'act5', 'act6', 'act7', 'act8', 'act9', 'act10'].map((a) => [a, 1e7]));
  st.world.rift.runs += 100;
  sys.update();
  ok(sys.list().every((x) => x.done), JSON.stringify(sys.list().map((x) => [x.type, x.prog, x.target])));
  const gold = st.meta.gold;
  const got = sys.claim(b.uid);
  ok(got && got.gold > 0, 'gold');
  ok(st.meta.gold > gold);
  ok(b.claimed);
  eq(sys.claim(b.uid), null, '2 回は受け取れない');
});
t('日課: 3 日まで繰り越し・それより古い物は消える・週課がある', () => {
  const g = fresh(); const sys = g.sys.bounties; const st = g.state;
  withDay(g, new Date(2026, 9, 10, 12)); st.meta.bounties.day = ''; st.meta.bounties.list = []; sys.refresh();
  eq(sys.list().length, 3);
  withDay(g, new Date(2026, 9, 12, 12)); sys.refresh();
  eq(sys.list().length, 6, '2 日後: 繰り越し 3 + 今日 3');
  withDay(g, new Date(2026, 9, 14, 12)); sys.refresh();
  eq(sys.list().filter((x) => x.day === localDay(new Date(2026, 9, 10))).length, 0, '4 日前の物は消える');
  ok(sys.weekly() && sys.weekly().weekly);
});
t('ログインの贈り物: 1 日 1 回・7 日で 1 巡り', () => {
  const g = fresh(); const sys = g.sys.bounties; const st = g.state;
  for (let i = 0; i < 8; i++) {
    withDay(g, new Date(2026, 9, 1 + i, 9));
    ok(sys.canClaimLogin(), `day ${i}`);
    ok(sys.claimLogin());
    ok(!sys.canClaimLogin());
  }
  eq(st.meta.daily.total, 8); eq(st.meta.daily.cycle % 7, 1);
  ok(st.meta.pets.eggs.egg_ash >= 1 && st.meta.pets.eggs.egg_ember >= 1, JSON.stringify(st.meta.pets.eggs));
});

// ---------------- ペット
t('ペット: 卵 → 孵卵器 → 倒して孵る → 持つ・連れる', () => {
  const g = fresh(); const sys = g.sys.pets; const ps = g.state.meta.pets;
  sys.addEgg('egg_ash', 2);
  ok(sys.incubate('egg_ash')); ok(sys.incubate('egg_ash')); ok(!sys.incubate('egg_ash'));
  for (let i = 0; i < 200; i++) sys.onKill({ rank: 'normal' });
  eq(sys.hatchReady(), 2);
  const r1 = sys.hatch(0); ok(r1 && ps.owned[r1.id]);
  ok(ps.active, 'はじめてのペットは自動で連れる');
  const H = computeHero(g.state, g);
  ok(H.mods.some((m) => m.src === 'pet') && H.mods.some((m) => m.src === 'petOwn'));
});
t('ペット: 重なると覚醒・餌でレベル', () => {
  const g = fresh(); const sys = g.sys.pets; const ps = g.state.meta.pets;
  sys.givePet('emberfox'); const r = sys.givePet('emberfox');
  ok(r.dup); eq(ps.owned.emberfox.stars, 1);
  g.state.meta.gold = 1e9;
  const k = sys.feed('emberfox', 10);
  eq(k, 10); ok(ps.owned.emberfox.lvl >= 3, `${ps.owned.emberfox.lvl}`);
  const m1 = sys.activeMods('emberfox').find((m) => m.s === 'inc_fire').v;
  ok(m1 > 5, `${m1}`);
});
t('ペット: 天井で必ず卵', () => {
  const g = fresh(); const sys = g.sys.pets; const ps = g.state.meta.pets;
  g.rng.chance = () => false; // 運が悪くても
  for (let i = 0; i < PET_BAL.PITY; i++) sys.onKill({ rank: 'champion', x: 0, y: 0 });
  eq(sys.eggCount(), 1); eq(ps.pity, 0);
});
t('ペット: 戦闘で手助けする（倒れない・ダメージを数える）', () => {
  const g = fresh('warrior', 5); const sys = g.sys.pets;
  sys.givePet('stormferret');
  sys.setActive('stormferret');
  run(g, 60);
  const u = sys.unit;
  ok(u && u.kind === 'pet', 'ペットの体がいる');
  ok(!g.combat.units.includes(u), '敵に狙われないように戦闘の一覧には入れない');
  ok(Math.abs(u.x - g.combat.hero.x) < 700, 'ついてくる');
  const br = g.sys.achievements.lifetimeBreakdown();
  ok(br.some((x) => x.id === 'pet' && x.dmg > 0), JSON.stringify(br.map((x) => x.id)));
  sys.setActive(null); run(g, 1);
  ok(!sys.unit);
});
t('ペット: すべての手助けの種類が動く', () => {
  for (const id of ['emberfox', 'ashcrow', 'mossling', 'lanternmoth', 'pebble', 'sporecap', 'gearowl', 'voidwisp', 'abyssfox', 'phoenixchick']) {
    const g = fresh('ranger', 8); g.sys.pets.givePet(id); g.sys.pets.setActive(id);
    run(g, 25);
    ok(g.sys.pets.abilityText(id).length > 5, id);
    ok(g.sys.pets.unit?.pet === id, id);
  }
});

// ---------------- 放置
t('放置: 上限・上限を超えた分は 25%・報告の項目', () => {
  const g = fresh(); run(g, 60);
  const st = g.state;
  const rep = g.sys.offline.grant(10 * 3600);
  ok(rep);
  eq(rep.capped, 8 * 3600); eq(rep.over, 2 * 3600); eq(rep.effSec, 8 * 3600 + 0.25 * 2 * 3600);
  ok(rep.kills > 0 && rep.gold > 0 && rep.xp > 0);
  ok(Array.isArray(rep.best) && rep.best.length <= 8);
  ok(rep.eggs && typeof rep.eggs === 'object');
  ok(Number.isFinite(rep.eff) && rep.eff > 0.7);
  eq(st.meta.stats.offlineSec, 10 * 3600);
});
t('放置: たくさん落ちたとき（1,500 個を超える）も数がそろい、素材になる', () => {
  const g = fresh(); run(g, 40);
  const st = g.state;
  g.sys.offline.buckets = [{ t: 100, kills: 300, xp: 1000, gold: 1000, drops: 60, levelSum: 300, elites: 12, bosses: 0 }];
  g.sys.offline.cur = g.sys.offline.blank();
  const mats0 = { ...st.inv.mats };
  const rep = g.sys.offline.grant(8 * 3600);
  const total = Object.values(rep.found).reduce((s, v) => s + v, 0);
  ok(rep.drops > 1500, `${rep.drops}`);
  ok(Math.abs(total - rep.drops) <= Object.keys(rep.found).length + 2, `${total} vs ${rep.drops}`);
  const dust = (st.inv.mats.dust || 0) - (mats0.dust || 0);
  ok(dust > 100, `dust ${dust}`);
  ok(rep.elites > 0);
});
t('放置: 日課・孵卵器が放置でも進む', () => {
  const g = fresh(); run(g, 60);
  g.sys.pets.addEgg('egg_ash'); g.sys.pets.incubate('egg_ash');
  const b = g.sys.bounties.list().find((x) => x.type === 'kills');
  g.sys.offline.grant(8 * 3600);
  ok(g.state.meta.pets.incubator[0].prog > 0);
  if (b) ok(b.prog > 0);
});

// ---------------- セーブ
t('セーブして読み直すと、メタの状態がそのまま残る', () => {
  const g = fresh('necromancer', 4);
  const st = g.state;
  st.meta.souls = 50; st.meta.prestige.unlocked = true; g.sys.prestige.buy('soul_life', 3);
  g.sys.pets.givePet('frostkit'); g.sys.pets.addEgg('egg_ember');
  run(g, 120);
  const H1 = computeHero(st, g);
  const json = JSON.stringify(g.snapshot());
  const g2 = new Game({ seed: 4 }); g2.load(JSON.parse(json));
  const s2 = g2.state;
  eq(s2.meta.upgrades.soul_life, 3); eq(s2.meta.pets.active, 'frostkit'); eq(s2.meta.pets.eggs.egg_ember, 1);
  eq(Object.keys(s2.meta.achievements).length, Object.keys(st.meta.achievements).length);
  eq(s2.meta.bounties.list.length, st.meta.bounties.list.length);
  const H2 = computeHero(s2, g2);
  near(H2.life, H1.life, H1.life * 1e-9, 'life');
});
t('古いセーブ（メタの項目が無い）も読める', () => {
  const raw = migrate({ hero: { cls: 'assassin', level: 12, equip: {}, skills: {}, bar: [] }, inv: { bag: [] }, meta: { bounties: { day: '', list: [{ bad: 1 }], weekly: null, done: 0 }, pets: { owned: { nope: 1 }, active: 'nope', eggs: {} } } });
  const g = new Game({ seed: 1 }); g.load(raw);
  const st = g.state;
  ok(st.meta.prestige && st.meta.record && Array.isArray(st.meta.pets.incubator));
  eq(st.meta.pets.active, null);
  ok(st.meta.bounties.list.every((b) => b.uid));
  run(g, 5);
});
t('長く回しても NaN が出ない（全部の仕組みつき）', () => {
  const g = fresh('assassin', 21);
  g.sys.pets.givePet('voidwisp'); g.sys.pets.setActive('voidwisp');
  g.state.meta.souls = 200; g.sys.prestige.buy('soul_blade', 5); g.sys.prestige.buy('soul_life', 5);
  run(g, 900);
  const H = computeHero(g.state, g);
  for (const [k, v] of Object.entries(H)) if (typeof v === 'number') ok(Number.isFinite(v), k);
  for (const m of H.mods) ok(Number.isFinite(m.v), `${m.s} ${m.src}`);
});
t('アイテムの生成とあわせて壊れない（宝物図鑑の登録）', () => {
  const g = fresh(); const rng = new RNG(3);
  for (let i = 0; i < 2000; i++) { const it = generateItem(rng, { ilvl: 1 + (i % 100), cls: 'warrior', mf: 200 }); g.sys.inv.receive(it, { quiet: true }); }
  ok(g.state.meta.stats.itemsFound.common > 0);
});

console.log(`\nmeta: ${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
