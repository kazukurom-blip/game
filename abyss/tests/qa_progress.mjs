// QA（進み具合の担当）: 見つけた不具合の再発を防ぐ確かめ。Node だけで動く。実行: node tests/qa_progress.mjs
// 物語の流れ（倒れたときのウェーブ・魔境のボスの自動再挑戦）・機能を少しずつ開く条件・卵と孵卵器・
// 裂け目の「クリア」の数え方・転生の魂（魔境・裂け目の Lv）・超越と裂け目/門番。
import { Game } from '../src/game/game.js';
import { ZONES, STAGES_PER_ZONE, WAVES_PER_STAGE, GATE_GROUPS, FINAL_ZONE } from '../src/data/world.js';
import { PET_BAL, EGGS } from '../src/data/pets.js';
import { ALTAR_BY_ID } from '../src/data/prestige.js';
import { FEATURE } from '../src/ui/unlocks.js';
import { WAVE_CHECKPOINT } from '../src/game/systems/world.js';
import { petsPanel } from '../src/ui/panels/pets.js';
import { ACH } from '../src/data/achievements.js';


let pass = 0; let fail = 0;
function t(name, fn) {
  try { const r = fn(); if (r === false) throw new Error('false'); pass++; } catch (e) { fail++; console.log(`✘ ${name}: ${e.stack?.split('\n').slice(0, 3).join(' | ') || e.message}`); }
}
const ok = (c, m = '') => { if (!c) throw new Error(m || 'not ok'); };
const eq = (a, b, m = '') => { if (a !== b) throw new Error(`${m} ${a} !== ${b}`); };
const errors = [];
const origErr = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); };

function fresh(cls = 'warrior', seed = 11) { const g = new Game({ seed }); g.newGame(cls, 'テスト'); return g; }
function run(g, sec) { for (let i = 0; i < sec * 20; i++) g.tick(0.05); }
function makeStrong(g, k = 1e10) {
  g.combat.buffs.push({ id: 'test_power', mods: [{ s: 'more_dmg', v: k }, { s: 'life', v: 1e12 }, { s: 'dr', v: 80 }], t: 1e9, name: 'テスト' });
  g.combat.recalc(true);
}
/** 物語を終えた形（全地域を踏破・魔境 III まで開いた） */
function storyDone(g, maxTorment = 3) {
  const w = g.state.world;
  for (const z of ZONES) { w.cleared[z.id] = true; w.maxStage[z.id] = STAGES_PER_ZONE; }
  w.maxZone = ZONES.length - 1; w.maxTorment = maxTorment; w.rift.unlocked = 20;
}
const killHero = (g) => g.combat.damageAlly(g.combat.hero, 1e18, 'void', null, true);

// ---------------- 機能を少しずつ開く: 宝石の窓
t('宝石の窓: 最初の装備にソケットがあっても、宝石もルーンも無いうちは開かない', () => {
  // 種 3 の剣闘士は最初の剣と鎧にソケットが付く（以前はこれで始めて 0 秒で開いていた）
  const g = fresh('warrior', 3);
  ok(Object.values(g.state.hero.equip).some((it) => it.sockets?.length), '前提: 最初の装備にソケットがある');
  eq(FEATURE.gems.cond(g), false, '始めた直後');
  run(g, 60);
  ok(g.state.inv.bag.some((it) => it.sockets?.length) || true);
  eq(FEATURE.gems.cond(g), Object.keys(g.state.inv.gems).length + Object.keys(g.state.inv.runes).length > 0, '1 分後（宝石もルーンも無ければ閉じたまま）');
});
t('宝石の窓: 宝石・ルーン・深淵の宝石を手に入れるか、はまった装備を拾うか、Lv 18 で開く', () => {
  const g = fresh('warrior', 3);
  g.state.inv.gems.ruby_1 = 1; ok(FEATURE.gems.cond(g), '宝石'); delete g.state.inv.gems.ruby_1;
  g.state.inv.runes.el = 1; ok(FEATURE.gems.cond(g), 'ルーン'); delete g.state.inv.runes.el;
  g.state.inv.lgems = { lg_test: { lvl: 0, uid: 1 } }; ok(FEATURE.gems.cond(g), '深淵の宝石'); g.state.inv.lgems = {};
  eq(FEATURE.gems.cond(g), false, '何も無い');
  const it = Object.values(g.state.hero.equip).find((x) => x.sockets?.length); it.sockets[0] = 'ruby_2';
  ok(FEATURE.gems.cond(g), 'はまった装備'); it.sockets[0] = null;
  g.state.hero.level = 18; ok(FEATURE.gems.cond(g), 'Lv 18');
  ok(!/ソケット/.test(FEATURE.gems.when), `いつ開くかの説明: ${FEATURE.gems.when}`);
});

t('ペット・極意の窓: 卵が無くてもペットを持っていれば、力の書庫に強さ 0 の力しかなくても開く', () => {
  // 以前は { id: { lvl } } や { id: 0 } を「数 > 0」で数えていて、卵を全部孵した古いセーブでペットの窓が出なかった
  const g = fresh('warrior', 3);
  eq(FEATURE.pets.cond(g), false);
  g.state.meta.pets.owned.emberfox = { lvl: 1, xp: 0, stars: 0, at: 1 };
  ok(FEATURE.pets.cond(g), 'ペットを持っている');
  eq(FEATURE.codex.cond(g), false);
  g.state.meta.codex.powers.some_power = 0;
  ok(FEATURE.codex.cond(g), '力の書庫');
});

// ---------------- 物語: 倒れたとき
t(`ふつうのステージで倒れても、ステージの最初ではなく区切り（${WAVE_CHECKPOINT} ウェーブごと）から続ける`, () => {
  const g = fresh('warrior', 5);
  const ws = g.sys.world;
  run(g, 2);
  ok(!ws.isBossStage());
  // ウェーブ 13 の途中で倒れる
  ws.wave = 13; g.combat.clearEnemies(); ws.spawnWave(); ws.wave = 13;
  const stage = g.state.world.stage;
  killHero(g);
  ok(g.combat.hero.dead, '倒れた');
  const untilAlive = () => { for (let i = 0; i < 200 && g.combat.hero.dead; i++) g.tick(0.05); };
  untilAlive(); // 3 秒で起き上がる
  ok(!g.combat.hero.dead, '起きた');
  eq(ws.wave, 10, '区切りのウェーブ 10 まで戻る（次はウェーブ 11）');
  eq(g.state.world.stage, stage, '同じステージ');
  run(g, 1.5);
  ok(ws.wave === 11 && g.combat.enemyCount() > 0, `ウェーブ 11 が出る（${ws.wave}）`);
  // 区切りの前（ウェーブ 4）なら最初から
  ws.wave = 4; killHero(g); untilAlive();
  eq(ws.wave, 0, '最初の区切りの前なら最初から');
});
t('倒れ続ける弱い主人公（放置・装備もスキルも触らない影刃）でも、同じステージに 10 分以上は止まらない', () => {
  // 以前は 1 回倒れるたびに 20 ウェーブの最初からやり直し、a1z2 の 1 つのステージに 16 分（倒れること 12 回）止まっていた
  const g = new Game({ seed: 7 }); g.newGame('assassin', 'qa');
  let last = 0; let worst = 0; let key = '';
  for (let s = 0; s < 60 * 60; s++) {
    run(g, 1);
    const k = `${g.state.world.zone}:${g.state.world.stage}`;
    if (k !== key) { key = k; last = g.state.playTime; }
    if (g.state.world.stage < STAGES_PER_ZONE - 1) worst = Math.max(worst, g.state.playTime - last);
  }
  ok(worst < 600, `ボスの手前以外のステージに最長 ${Math.round(worst / 60)} 分`);
  // 以前は 1 時間で a1z2 のステージ 4 まで。今は a1z2 のボスまで届く（その先は装備・スキルの壁で、次の目標の欄が手段を示す）
  ok((g.state.world.maxStage.a1z2 || 0) >= STAGES_PER_ZONE, `1 時間で a1z2 のボスまで（${JSON.stringify(g.state.world.maxStage)}）`);
});

// ---------------- 魔境: ボスの自動再挑戦
t('魔境: 踏破した地域のボスに負けても、自動の再挑戦（再挑戦の誓い）が動く', () => {
  const g = fresh('warrior', 3); storyDone(g);
  g.sys.prestige.grantFree('auto_boss', 'テスト');
  ok(g.state.meta.unlocks.autoBoss, '前提: 再挑戦の誓い');
  g.sys.world.travel('a1z2', 9);
  g.sys.world.setTorment(1);
  g.state.world.stage = STAGES_PER_ZONE; g.sys.world.startStage(); run(g, 1);
  g.sys.world.onBossFail('時間切れ');
  eq(g.state.world.stage, STAGES_PER_ZONE - 1); eq(g.state.world.bossFailZone, 'a1z2');
  let retried = 0; g.events.on('autoBossRetry', () => retried++);
  for (let i = 0; i < 3 && !retried; i++) { g.state.playTime += 400; g.sys.world.onStageClear(); }
  ok(retried >= 1, '再挑戦した');
  eq(g.state.world.stage, STAGES_PER_ZONE, 'ボスのステージへ');
});
t('魔境でない物語では、踏破済みの地域（昔の地域で負けた）は今まで通り自動で挑まない', () => {
  const g = fresh('warrior', 3); storyDone(g, 0);
  g.sys.prestige.grantFree('auto_boss', 'テスト');
  g.sys.world.travel('a1z2', STAGES_PER_ZONE); run(g, 1);
  g.sys.world.onBossFail('時間切れ');
  let retried = 0; g.events.on('autoBossRetry', () => retried++);
  for (let i = 0; i < 3; i++) { g.state.playTime += 400; g.sys.world.onStageClear(); }
  eq(retried, 0);
});

// ---------------- 卵と孵卵器
t('卵は空いた孵卵器へ最初から自動で入る（祭壇の「孵化の番人」が無くても）', () => {
  const g = fresh();
  ok(!g.state.meta.unlocks.autoHatch, '前提: 番人なし');
  g.sys.pets.addEgg('egg_ash', 3);
  eq(g.state.meta.pets.incubator.length, PET_BAL.INCUBATORS, '孵卵器がうまる');
  eq(g.sys.pets.eggCount(), 3 - PET_BAL.INCUBATORS, '残りは持ち物に');
  // 孵るのは手で（番人なし）。孵ったら次の卵が入る
  for (const inc of g.state.meta.pets.incubator) inc.prog = inc.need;
  run(g, 3);
  eq(Object.keys(g.state.meta.pets.owned).length, 0, '番人なしでは勝手に孵さない');
  ok(g.sys.pets.hatchReady() === PET_BAL.INCUBATORS);
  g.sys.pets.hatch(0);
  eq(Object.keys(g.state.meta.pets.owned).length, 1);
  eq(g.state.meta.pets.incubator.length, PET_BAL.INCUBATORS, '空いた孵卵器に次の卵');
  eq(g.sys.pets.eggCount(), 0);
});
t('卵の自動の出し入れは切れる（ペットの窓のスイッチ）・放置の卵も入る', () => {
  const g = fresh();
  g.sys.pets.setAutoFill(false);
  g.sys.pets.addEgg('egg_ember', 1);
  eq(g.state.meta.pets.incubator.length, 0, 'OFF なら入れない');
  g.sys.pets.setAutoFill(true);
  eq(g.state.meta.pets.incubator.length, 1, 'ON にしたら入る');
  const g2 = fresh();
  g2.state.meta.pets.pity = PET_BAL.PITY - 1;
  const rep = { kills: 50, elites: 5, bosses: 0, rate: { level: 1 } };
  g2.sys.pets.onOffline(rep);
  ok(g2.state.meta.pets.incubator.length >= 1, '放置で手に入れた卵も入る');
  ok(ALTAR_BY_ID.auto_hatch.desc.includes('孵'), ALTAR_BY_ID.auto_hatch.desc);
});
t('ペットの窓の説明の卵の確率は data の数と同じ', () => {
  const champ = Math.round(1 / PET_BAL.EGG_CHANCE.champion);
  ok(petsPanel.help.includes(`チャンピオン 1/${champ}`), `チャンピオン 1/${champ} が無い`);
  ok(petsPanel.help.includes(`ボス 1/${Math.round(1 / PET_BAL.EGG_CHANCE.boss)}`));
});

// ---------------- 深淵の裂け目: 「クリア」の数え方
t('裂け目をやめた・時間切れは「クリア」に数えない（実績「初めての裂け目」・日課「裂け目」）', () => {
  const g = fresh('warrior', 3); storyDone(g);
  const bs = g.sys.bounties;
  const b = bs.makeBounty('rift', bs.today(), g.rng); bs.b.list.push(b);
  g.sys.rift.begin(1); run(g, 3); g.sys.rift.abandon(); run(g, 6);
  g.sys.rift.begin(1); run(g, 3); g.state.world.rift.run.timeLeft = 0.01; run(g, 8);
  g.sys.achievements.check(); bs.update();
  eq(g.state.world.rift.clears || 0, 0, '前提: クリアなし');
  ok(!g.state.meta.achievements.riftRuns_1, '実績「初めての裂け目」はまだ');
  eq(b.prog, 0, '日課の進み'); eq(b.done, false);
  // 踏破すると数える
  makeStrong(g);
  g.sys.rift.begin(1);
  for (let i = 0; i < 200 && g.state.world.rift.run; i++) { g.state.world.rift.run.progress = Math.max(g.state.world.rift.run.progress, 399.5); run(g, 1); }
  g.sys.achievements.check(); bs.update();
  eq(g.state.world.rift.clears, 1, 'クリア 1');
  ok(g.state.meta.achievements.riftRuns_1, '実績');
  ok(b.done, '日課');
});
t('前の版の「裂け目」の日課（挑んだ回数で数えていた）は、進み具合を保って数え直す', () => {
  const g = fresh('warrior', 3); storyDone(g);
  const R = g.state.world.rift; R.runs = 7; R.clears = 2;
  const bs = g.sys.bounties;
  const old = { ...bs.makeBounty('rift', bs.today(), g.rng), base: 6, prog: 1, target: 2 }; delete old.ctr;
  bs.b.list.push(old);
  const snap = JSON.parse(JSON.stringify(g.snapshot()));
  const g2 = new Game({ seed: 4 }); g2.load(snap);
  const b2 = g2.sys.bounties.b.list.find((x) => x.uid === old.uid);
  g2.sys.bounties.update();
  eq(b2.prog, 1, '進み具合はそのまま');
  g2.state.world.rift.clears = 3; g2.sys.bounties.update();
  ok(b2.done, 'あと 1 回のクリアで終わる');
});

// ---------------- 転生: 魂の元になるエリア Lv
t('転生の直後に魔境へ入っても、物語を終えるまでは魔境の Lv で魂が増えない（20 分ごとの転生で魂を稼げない）', () => {
  const g = fresh('warrior', 3); storyDone(g); makeStrong(g);
  g.state.meta.prestige.unlocked = true; g.sys.prestige.applyUnlocks();
  g.state.meta.prestige.life.maxLevel = 99;
  ok(g.sys.prestige.rebirth().ok, '1 回目の転生');
  run(g, 2);
  const before = g.sys.prestige.previewSouls();
  g.sys.world.setTorment(3);
  run(g, 3);
  ok(g.sys.world.level() >= 100, `魔境の Lv ${g.sys.world.level()}`);
  eq(g.sys.prestige.previewSouls(), before, '魂の見込み');
  // 裂け目も同じ
  g.sys.rift.begin(10); run(g, 3);
  eq(g.sys.prestige.previewSouls(), before, '裂け目でも');
  g.sys.rift.abandon(); run(g, 2);
  // この周回で物語を終えたら、魔境・裂け目の Lv も数える
  g.state.world.cleared[FINAL_ZONE] = true;
  g.sys.world.setTorment(3); run(g, 3);
  ok(g.sys.prestige.previewSouls() > 250, `物語のあとは魔境の Lv で ${g.sys.prestige.previewSouls()}`);
});
t('1 周目に物語を終えたあとの魔境は今まで通り魂に数える', () => {
  const g = fresh('warrior', 3); storyDone(g); makeStrong(g);
  g.state.meta.prestige.unlocked = true; g.sys.prestige.applyUnlocks();
  g.sys.world.setTorment(2); run(g, 3);
  ok(g.state.meta.prestige.life.maxLevel >= 102, `${g.state.meta.prestige.life.maxLevel}`);
});

// ---------------- 超越と裂け目・門番
t('裂け目の途中で超越しても、裂け目の途中が残らない', () => {
  const g = fresh('warrior', 3); storyDone(g); makeStrong(g, 30);
  const p = g.state.meta.prestige; p.unlocked = true; g.state.meta.rebirths = 5; p.soulsSinceTrans = 1000; g.sys.prestige.applyUnlocks();
  g.sys.rift.begin(2); run(g, 2);
  ok(g.sys.prestige.transcend().ok);
  eq(g.state.world.mode, 'campaign'); eq(g.state.world.rift.run, null, '裂け目の途中');
  run(g, 5);
  eq(g.state.world.torment, 0);
});
t('門番と戦っている途中で超越すると、欠片は戻る', () => {
  const g = fresh('warrior', 4); storyDone(g); makeStrong(g);
  const p = g.state.meta.prestige; p.unlocked = true; g.state.meta.rebirths = 5; p.soulsSinceTrans = 1000; g.sys.prestige.applyUnlocks();
  g.sys.world.setTorment(1);
  const gid = GATE_GROUPS[0].id;
  for (let k = 0; k < 4; k++) g.state.world.gate.frags[`${gid}_${k}`] = 1;
  ok(g.sys.rift.summonGate(0).ok);
  g.combat.hero.life = g.combat.hero.maxLife;
  ok(g.sys.prestige.transcend().ok);
  eq(g.state.world.mode, 'campaign'); eq(g.state.world.gate.run, null, '門番の途中');
  for (let k = 0; k < 4; k++) eq(g.state.world.gate.frags[`${gid}_${k}`], 1, `欠片 ${k}`);
});

// ---------------- 短い留守
t('5〜30 秒の空白（タブを少し離れた）は、その時間ぶん進める（放置の稼ぎの下限より短くても消えない）', () => {
  const g = fresh('warrior', 6);
  run(g, 10);
  const t0 = g.state.playTime; const k0 = g.state.meta.stats.kills;
  g.update(20); // 20 秒ぶりのフレーム
  ok(g.state.playTime - t0 >= 19.9, `進んだ時間 ${(g.state.playTime - t0).toFixed(1)} 秒`);
  ok(g.state.meta.stats.kills > k0, '倒している');
  // 30 秒からは今まで通り放置の稼ぎ（報告つき）
  let rep = null; g.events.on('offlineReport', (r) => { rep = r; });
  g.update(45);
  ok(rep && rep.seconds === 45, '45 秒は放置の稼ぎ');
});

// ---------------- 実績の説明
t('秘密の実績「好奇心」の説明は数と合う', () => {
  const a = ACH.secret_curious;
  ok(a.desc.includes(String(a.n)), a.desc);
});

console.error = origErr;
if (errors.length) console.log('console.error:', errors.slice(0, 5));
console.log(`\nqa_progress: ${pass} 通過 / ${fail} 失敗`);
process.exit(fail || errors.length ? 1 : 0);
