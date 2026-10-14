// 戦闘・スキル・補助の刻印・星座盤・パラゴン・熟練度の確かめ（Node だけで動く）。実行: node tests/combat.mjs [--quick]
import { Game } from '../src/game/game.js';
import { SKILLS, SKILL, skillsOf, RUNE_LEVELS, MASTERY_XP } from '../src/data/skills.js';
import { CLASSES } from '../src/data/classes.js';
import { SUPPORTS, SUPPORT, supportFits, glyphXpFor, glyphLevelOf } from '../src/data/supports.js';
import { TREE_NODES, TREE_NODE, TREE_START, KEYSTONES, PARAGON_LINE, PARAGON_BOARDS } from '../src/data/tree.js';
import { resolveSkill, applyMod, skillDesc, estimateDps, estimateBuildDps, masteryLevel } from '../src/game/skills.js';
import { computeHero, heroPower, effectiveLife } from '../src/game/character.js';
import { behaviors } from '../src/game/combat.js';
import { BAL } from '../src/data/balance.js';
import { ZONES } from '../src/data/world.js';

const QUICK = process.argv.includes('--quick');
let pass = 0; let fail = 0;
const errors = [];
const origErr = console.error;
console.error = (...a) => { errors.push(a.map((x) => x?.stack || String(x)).join(' ')); };
function t(name, fn) {
  const before = errors.length;
  try {
    const r = fn();
    if (r === false) throw new Error('false');
    if (errors.length > before) throw new Error(`console.error: ${errors.slice(before, before + 2).join(' | ')}`);
    pass++;
  } catch (e) { fail++; console.log(`✘ ${name}: ${e.message}`); }
}
const ok = (c, m = '') => { if (!c) throw new Error(m || 'not ok'); };
const eq = (a, b, m = '') => { if (a !== b) throw new Error(`${m} ${a} !== ${b}`); };
const finite = (v, m = '') => { if (!Number.isFinite(v)) throw new Error(`${m} = ${v}`); };
const NUM = /[0-9]/;

function setupHero(cls, level = 60, skillLvl = 10, seed = 5) {
  const g = new Game({ seed });
  g.newGame(cls, 'テスト');
  const h = g.state.hero;
  h.level = level;
  g.sys.skills.learnUnlocked(true);
  for (const id of Object.keys(h.skills)) h.skills[id].lvl = skillLvl;
  g.combat.recalc(true);
  g.combat.hero.life = g.combat.hero.maxLife;
  return g;
}
const ticks = (g, sec) => { for (let i = 0; i < sec * 20; i++) g.tick(0.05); };

// ======================================================================= データ
t('各クラス 12 スキル（基本 2・技 7・強化/召喚 2・奥義 1）', () => {
  for (const c of CLASSES) {
    const list = skillsOf(c.id);
    eq(list.length, 12, c.id);
    const k = (x) => list.filter((s) => s.kind === x).length;
    eq(k('basic'), 2, `${c.id} basic`); eq(k('active'), 7, `${c.id} active`); eq(k('buff') + k('summon'), 2, `${c.id} buff/summon`); eq(k('ult'), 1, `${c.id} ult`);
    for (const s of list) if (s.kind === 'basic') ok(s.basic, `${s.id} basic flag`);
  }
});
t('前からある 10 個のスキルの id が残っている', () => { for (const id of ['w_slash', 'w_cleave', 'r_shot', 'r_multishot', 's_bolt', 's_nova', 'n_bonespear', 'n_skeleton', 'a_stab', 'a_fan']) ok(SKILL[id], id); });
t('ルーンは各スキル 4 つ・id が重ならない・説明に数字', () => {
  for (const s of SKILLS) {
    eq(s.runes.length, 4, s.id);
    eq(new Set(s.runes.map((r) => r.id)).size, 4, `${s.id} rune ids`);
    for (const r of s.runes) { ok(NUM.test(r.desc), `${s.id}.${r.id} の説明に数字が無い`); ok(r.mod && typeof r.mod === 'object', `${s.id}.${r.id} mod`); }
  }
});
t('解放レベルは 1〜60 に散らばり、奥義は待ち時間が長い', () => {
  for (const c of CLASSES) {
    const list = skillsOf(c.id);
    ok(list.every((s) => s.unlock >= 1 && s.unlock <= 60), c.id);
    ok(new Set(list.map((s) => s.unlock)).size >= 9, `${c.id} 解放レベルが散らばっていない`);
    const u = list.find((s) => s.kind === 'ult');
    ok(u.cd >= 60, `${u.id} cd`);
  }
});
t('すべてのスキルの動き（behavior）がある', () => { for (const s of SKILLS) { ok(behaviors[s.behavior], `${s.id} ${s.behavior}`); for (const r of s.runes) if (r.mod.behavior) ok(behaviors[r.mod.behavior], `${s.id}.${r.id}`); } });
t('説明の {…} がすべて数字に置き換わる', () => {
  for (const c of CLASSES) {
    const g = setupHero(c.id, 60, 5);
    for (const s of skillsOf(c.id)) {
      const d = skillDesc(g.state, g.H, s.id);
      ok(!/\{\w+\}/.test(d), `${s.id}: ${d}`);
      ok(NUM.test(d), `${s.id} 数字なし: ${d}`);
    }
  }
});
t('クラスの特性がある（説明に数字）', () => { for (const c of CLASSES) ok(c.trait?.id && NUM.test(c.trait.desc), c.id); });
t('補助の刻印 30 種・説明に数字・どれかのスキルにはまる', () => {
  eq(SUPPORTS.length, 30);
  eq(new Set(SUPPORTS.map((s) => s.id)).size, 30);
  for (const s of SUPPORTS) {
    for (const lv of [1, 10, 20]) ok(NUM.test(s.desc(lv)), `${s.id} lv${lv}`);
    ok(SKILLS.some((d) => supportFits(s, d)), `${s.id} はまるスキルが無い`);
  }
});
t('刻印の合成の経験とレベル', () => { eq(glyphLevelOf(0), 1); eq(glyphLevelOf(1), 2); eq(glyphLevelOf(glyphXpFor(20)), 20); eq(glyphLevelOf(9999), 20); });
t('星座盤: 約 360 点・要の点 30・要石 12・出発点 5・すべてつながる', () => {
  ok(TREE_NODES.length >= 340 && TREE_NODES.length <= 400, `nodes ${TREE_NODES.length}`);
  const c = (ty) => TREE_NODES.filter((n) => n.type === ty).length;
  eq(c('notable'), 30); eq(c('keystone'), 12); eq(c('start'), 5);
  eq(new Set(TREE_NODES.map((n) => n.id)).size, TREE_NODES.length, 'id');
  for (const n of TREE_NODES) for (const l of n.links) ok(TREE_NODE[l]?.links.includes(n.id), `link ${n.id}-${l}`);
  const seen = new Set([TREE_START.warrior]); const q = [TREE_START.warrior];
  while (q.length) { const id = q.shift(); for (const l of TREE_NODE[id].links) if (!seen.has(l)) { seen.add(l); q.push(l); } }
  eq(seen.size, TREE_NODES.length, 'connected');
  for (const n of TREE_NODES) if (n.type === 'notable') ok(n.name && n.mods.length >= 2, n.id);
  for (const k of KEYSTONES) ok(NUM.test(k.desc), k.id);
});
t('パラゴンは 4 つの盤・主の線は上限なし', () => { eq(PARAGON_BOARDS.length, 4); for (const b of PARAGON_BOARDS) { ok(PARAGON_LINE[`${b.id}.main`].cap === 0, b.id); ok(b.lines.filter((l) => l.id !== 'main').every((l) => PARAGON_LINE[`${b.id}.${l.id}`].cap > 0)); } });

// ======================================================================= 数値
t('すべてのスキル × レベル × ルーン × 刻印で数値が壊れない', () => {
  for (const c of CLASSES) {
    const g = setupHero(c.id, 60, 1);
    const st = g.state;
    for (const s of skillsOf(c.id)) {
      for (const lv of [1, 10, 20]) {
        st.hero.skills[s.id].lvl = lv;
        for (const rune of [null, ...s.runes.map((r) => r.id)]) {
          st.hero.skills[s.id].rune = rune;
          const fits = SUPPORTS.filter((x) => supportFits(x, s)).slice(0, 3);
          st.hero.skills[s.id].supports = [0, 1, 2].map((i) => (fits[i] ? { uid: 900 + i, id: fits[i].id, lvl: 20, xp: glyphXpFor(20) } : null));
          const p = resolveSkill(st, g.H, s.id);
          for (const k of ['dmgPct', 'cost', 'cd', 'castTime', 'range', 'radius', 'count', 'speed', 'pierce', 'chain', 'duration', 'dmgMul']) finite(p[k], `${s.id} lv${lv} ${rune} ${k}`);
          ok(p.castTime > 0 && p.count >= 1, `${s.id} cast/count`);
          finite(estimateDps(st, g.H, s.id), `${s.id} dps`);
        }
        st.hero.skills[s.id].supports = [null, null, null];
        st.hero.skills[s.id].rune = null;
      }
    }
  }
});
t('applyMod の基本', () => {
  const p = { count: 1, pierce: 0, chain: 0, radius: 100, cd: 10, cost: 20, castTime: 0.5, dmgMul: 1, statuses: [], extra: {}, tags: [], buff: { mods: [], dur: 5 } };
  applyMod(p, { countAdd: 2, pierce: 1, radius: 1.5, cdMul: 0.5, costMul: 0.5, dmgMul: 1.2, status: { id: 'ignite', chance: 0.3 }, extra: { critBonusAdd: 0.1 }, buffMods: [{ s: 'inc_dmg', v: 5 }] });
  eq(p.count, 3); eq(p.pierce, 1); eq(p.radius, 150); eq(p.cd, 5); eq(p.cost, 10); ok(Math.abs(p.dmgMul - 1.2) < 1e-9); eq(p.statuses[0].id, 'ignite'); eq(p.extra.critBonus, 0.1); eq(p.buff.mods.length, 1);
});
t('刻印は resolveSkill に効く（拡散 → 弾 +2）', () => {
  const g = setupHero('ranger', 30, 5);
  const before = resolveSkill(g.state, g.H, 'r_shot').count;
  g.state.hero.skills.r_shot.supports[0] = { uid: 1, id: 'sup_multi', lvl: 1, xp: 0 };
  eq(resolveSkill(g.state, g.H, 'r_shot').count, before + 2);
  g.state.hero.skills.r_shot.supports[0] = { mod: { countAdd: 5 } }; // 古い形（mod をそのまま持つ）
  eq(resolveSkill(g.state, g.H, 'r_shot').count, before + 5);
});
t('熟練度: 1 段ごとに +4%、5 段・10 段の効果', () => {
  const g = setupHero('sorcerer', 30, 5);
  const st = g.state;
  const p0 = resolveSkill(st, g.H, 's_meteor');
  st.hero.skills.s_meteor.mxp = MASTERY_XP[5];
  const p5 = resolveSkill(st, g.H, 's_meteor');
  eq(p5.mastery, 5);
  ok(Math.abs(p5.dmgMul / p0.dmgMul - 1.2) < 1e-6, 'dmg +20%');
  ok(p5.cd < p0.cd * 0.9, 'cd -15%');
  st.hero.skills.s_meteor.mxp = MASTERY_XP[10];
  eq(resolveSkill(st, g.H, 's_meteor').mastery, 10);
  eq(masteryLevel(1e9), 10);
});
t('使うと熟練度が上がり、放置中も上がる', () => {
  const g = setupHero('warrior', 20, 5);
  ticks(g, 30);
  const mx = g.state.hero.skills.w_slash.mxp;
  ok(mx > 0, 'cast xp');
  const before = Object.fromEntries(Object.entries(g.state.hero.skills).map(([k, v]) => [k, v.mxp]));
  g.sys.offline.grant(3600, { reason: 'test' });
  ok(g.state.hero.bar.some((id) => g.state.hero.skills[id].mxp > before[id]), 'offline mastery');
});
t('要石のルール（鉄壁・一点・天秤・渇き・軍勢）', () => {
  const g = setupHero('necromancer', 60, 5);
  const base = computeHero(g.state, g, {});
  const H = computeHero(g.state, g, { extraMods: [{ s: 'ks_ironvow', v: 1 }, { s: 'ks_precise', v: 1 }, { s: 'ks_balance', v: 1 }, { s: 'ks_thirst', v: 1 }, { s: 'ks_legion', v: 1 }, { s: 'minion_count', v: 2 }, { s: 'res_fire', v: 50 }] });
  eq(H.dodge, 0); eq(H.critChance, 0); ok(H.incBase > base.incBase, 'precise inc');
  eq(H.res.cold, H.res.fire); eq(H.lifeRegen, 0); eq(H.leechCapMul, 2); ok(H.ks.legion);
  ok(resolveSkill(g.state, H, 'n_skeleton').maxSummons >= resolveSkill(g.state, base, 'n_skeleton').maxSummons + 2);
});
t('二重詠唱: 呪文の消費 ×2.5・待ち時間 +30%', () => {
  const g = setupHero('sorcerer', 30, 5);
  const a = resolveSkill(g.state, g.H, 's_meteor');
  const H = computeHero(g.state, g, { extraMods: [{ s: 'ks_twincast', v: 1 }] });
  const b = resolveSkill(g.state, H, 's_meteor');
  ok(b.twin && Math.abs(b.cost / a.cost - 2.5) < 1e-6 && Math.abs(b.cd / a.cd - 1.3) < 1e-6);
});
t('戦力: 正の数で、レベルが上がると大きくなる', () => {
  for (const c of CLASSES) {
    const g1 = setupHero(c.id, 5, 1); const g2 = setupHero(c.id, 50, 10);
    const a = heroPower(g1.H, g1.state); const b = heroPower(g2.H, g2.state);
    ok(a > 0 && b > a, `${c.id} ${a} ${b}`);
    ok(heroPower(g1.H) > 0, 'no state');
    finite(estimateBuildDps(g2.state, g2.H)); finite(effectiveLife(g2.H));
  }
});
t('装備の比べ（compare）が動く', () => {
  const g = setupHero('warrior', 10, 2);
  const it = g.state.hero.equip.weapon;
  const c = g.sys.inv.compare(it, 'weapon');
  finite(c.dpsPct); finite(c.ehpPct);
});

// ======================================================================= 戦闘
t('すべてのスキルが実際の戦闘で使われ、エラーが出ない', () => {
  for (const c of CLASSES) {
    const g = setupHero(c.id, 60, 10, 11);
    const st = g.state;
    st.hero.autoBar = false;
    const casts = {};
    const orig = g.combat.startCast.bind(g.combat);
    g.combat.startCast = (h, p, tg) => { casts[p.id] = (casts[p.id] || 0) + 1; return orig(h, p, tg); };
    const basic = skillsOf(c.id).find((s) => s.basic).id;
    for (const s of skillsOf(c.id)) {
      st.hero.bar = s.basic ? [s.id] : [basic, s.id];
      g.combat.recalc();
      g.combat.hero.cds = {};
      g.combat.hero.resource = g.H.resourceMax;
      for (let k = 0; k < 40 && !casts[s.id]; k++) {
        if (s.kind === 'ult' && k % 10 === 0) g.combat.spawnMonster('boss_butcher', { level: 60, rank: 'boss', x: g.combat.hero.x + 250 });
        if (k % 4 === 3) g.combat.spawnMonster('bog_slime', { level: 60, lifeMul: 40, x: g.combat.hero.x + 70 }); // 近くでしか使わない技のため
        if (s.behavior === 'corpse' && !g.combat.corpses.length) g.combat.corpses.push({ x: g.combat.hero.x + 90, y: 0, maxLife: 1000, t: 10, id: -1 }); // 死体が要る技
        ticks(g, 0.5);
        if (g.combat.hero.dead) g.combat.reviveHero();
        g.combat.hero.resource = g.H.resourceMax;
      }
      ok(casts[s.id] > 0, `${c.id}: ${s.id}（${s.behavior}）が一度も使われない`);
      // 続けて少し回す（遅れて起こること・弾・召喚物）
      ticks(g, 3);
      if (g.combat.hero.dead) g.combat.reviveHero();
    }
  }
});
t('奥義はボス・エリートに使い、ult の出来事を出す', () => {
  const g = setupHero('warrior', 60, 10, 3);
  g.sys.skills.autoArrange(true);
  ok(g.state.hero.bar.includes('w_ult'), `bar ${g.state.hero.bar}`);
  let ults = 0;
  for (let k = 0; k < 120 && !ults; k++) {
    if (k % 20 === 0) g.combat.spawnMonster('boss_ashlord', { level: 60, rank: 'boss', x: g.combat.hero.x + 300 });
    for (let i = 0; i < 10; i++) { g.tick(0.05); for (const e of g.combat.fx) if (e.t === 'ult' && e.cls === 'warrior') ults++; g.combat.fx = []; }
  }
  ok(ults > 0, 'ult not used');
});
t('召喚物はついてきて、敵を攻撃する', () => {
  const g = setupHero('necromancer', 20, 5, 4);
  ticks(g, 20);
  const mins = g.combat.units.filter((u) => u.kind === 'minion' && !u.dead);
  ok(mins.length >= 1, 'no minions');
  const h = g.combat.hero;
  ok(mins.every((m) => Math.abs(m.x - h.x) < 900), 'minions too far');
  ok(g.state.meta.stats.kills > 5);
});
t('障壁はダメージを吸う', () => {
  const g = setupHero('warrior', 30, 5);
  const h = g.combat.hero;
  behaviors.barrier(g.combat, h, g.combat.params('w_warcry'));
  ok(h.shield > 0, 'shield');
  const life = h.life; const sh = h.shield;
  g.combat.damageAlly(h, sh * 0.5, 'fire', null, true);
  ok(h.life === life && h.shield < sh, 'absorb');
});
t('呪いで敵の受けるダメージが増える', () => {
  const g = setupHero('necromancer', 30, 5);
  const u = g.combat.spawnMonster('rot_zombie', { level: 30, x: g.combat.hero.x + 200 });
  const m0 = g.combat.takenMul(u);
  g.combat.applyCurse(u, { vuln: 0.2, weaken: 0.2, dur: 5 }, g.combat.params('n_curse'));
  ok(g.combat.takenMul(u) > m0 + 0.19);
});
t('刻印: ドロップ率・自動合成・穴の条件・合成', () => {
  const g = setupHero('ranger', 9, 5, 21);
  const sys = g.sys.skills;
  const u = { rank: 'normal', level: 10, lootMul: 1 };
  let n = 0; for (let i = 0; i < 30000; i++) if (sys.rollGlyphDrop(u)) n++;
  ok(n > 60 && n < 150, `normal drops ${n}/30000`);
  let b = 0; for (let i = 0; i < 2000; i++) if (sys.rollGlyphDrop({ rank: 'boss', level: 10, boss: true })) b++;
  ok(b > 350 && b < 650, `boss drops ${b}/2000`);
  g.state.inv.glyphs = [];
  sys.addGlyph({ id: 'sup_pierce', lvl: 1, xp: 0 });
  sys.addGlyph({ id: 'sup_pierce', lvl: 1, xp: 0 });
  eq(g.state.inv.glyphs.length, 1, 'auto fuse');
  eq(g.state.inv.glyphs[0].lvl, 2, 'fused lvl');
  eq(sys.openSockets(), 0);
  ok(sys.socket('r_shot', 0, g.state.inv.glyphs[0].uid).ok === false, 'closed socket');
  g.state.hero.level = 10;
  eq(sys.openSockets(), 1);
  const gl = g.state.inv.glyphs[0];
  ok(sys.socket('r_shot', 0, gl.uid).ok, 'socket ok');
  eq(g.state.inv.glyphs.length, 0);
  sys.addGlyph({ id: 'sup_pierce', lvl: 1, xp: 0 }); // はめている物があるので持ち物に残る
  eq(g.state.inv.glyphs.length, 1);
  ok(sys.fuse(gl.uid, g.state.inv.glyphs[0].uid), 'fuse into socketed');
  eq(gl.xp, 2); eq(gl.lvl, 2);
  sys.addGlyph({ id: 'sup_pierce', lvl: 2, xp: 1 });
  ok(sys.fuse(gl.uid, g.state.inv.glyphs[0].uid));
  eq(gl.lvl, 3, 'xp 2 + 2 = 4 → Lv3');
  sys.inv.glyphAutoFuse = false;
  sys.addGlyph({ id: 'sup_area', lvl: 1, xp: 0 });
  ok(sys.socketProblem('r_shot', 0, g.state.inv.glyphs[0]), 'r_shot is not area');
  ok(!sys.socketProblem('r_volley', 0, g.state.inv.glyphs[0]), 'volley is area');
  sys.unsocket('r_shot', 0);
  eq(g.state.hero.skills.r_shot.supports[0], null);
});
t('刻印は実際の戦闘で落ちる（1 時間で数個〜数十個）', () => {
  const g = new Game({ seed: 77 }); g.newGame('assassin', 'x');
  let got = 0; g.events.on('glyphFound', () => got++);
  ticks(g, QUICK ? 600 : 1800);
  ok(got >= 1 && got < 120, `glyphs ${got}`);
});

// ======================================================================= 星座盤・パラゴン
t('星座盤: 最短の道で振る・外す・振り直し・構成', () => {
  const g = setupHero('sorcerer', 25, 1);
  const tr = g.sys.tree;
  const t0 = g.state.hero.tree;
  t0.points = 20;
  const target = 'sorcerer.b0.n';
  const path = tr.pathTo(target);
  ok(path && path.length >= 5 && path.length <= 12, `path ${path?.length}`);
  const r = tr.allocate(target);
  ok(r.ok && tr.isAllocated(target), 'alloc');
  eq(t0.points, 20 - path.length);
  ok(g.H.S.inc_fire >= 25, 'notable stat');
  const pv = tr.previewDelta('sorcerer.b0.w5', 'add');
  ok(pv && Number.isFinite(pv.dpsPct) && Number.isFinite(pv.ehpPct));
  // 途中の点を外すと先も外れる
  const mid = path[1];
  const rm = tr.removalSet(mid);
  ok(rm.includes(target), 'orphan');
  ok(tr.deallocate(mid).ok);
  ok(!tr.isAllocated(target));
  tr.allocate(target);
  tr.saveBuild(0);
  ok(tr.respec().ok && t0.alloc.length === 1, 'respec');
  eq(tr.respecCost(), 0, 'free < 30');
  const lb = tr.loadBuild(0);
  ok(lb.ok && tr.isAllocated(target), 'load build');
  g.state.hero.level = 40;
  ok(tr.respecCost() > 0, 'cost >= 30');
  g.state.meta.gold = 0;
  ok(!tr.respec().ok, 'no gold');
  ok(tr.pathTo('warrior.start') === null || tr.pathTo('warrior.start')?.length === 0 || !tr.canAllocate('warrior.start'), 'other start');
});
t('星座盤: 10 レベルごとに追加の点', () => {
  const g = new Game({ seed: 1 }); g.newGame('warrior', 'x');
  const p0 = g.state.hero.tree.points;
  let need = 0; for (let l = 1; l < 12; l++) need += BAL.xpToNext(l); // Lv12 まで（経験値の曲線が変わっても通るように）
  g.addXp(need);
  const L = g.state.hero.level;
  ok(L >= 10, `lvl ${L}`);
  eq(g.state.hero.tree.points - p0, (L - 1) + Math.floor(L / 10), 'points');
});
t('要石を振ると効く（鉄壁の誓い → 回避 0）', () => {
  const g = setupHero('warrior', 99, 1);
  g.state.hero.tree.points = 200;
  ok(g.sys.tree.allocate('ks.ironvow').ok);
  eq(g.H.dodge, 0);
  ok(g.sys.tree.keystones().some((k) => k.id === 'ironvow'));
});
t('パラゴン: 点・上限・おまかせ', () => {
  const g = setupHero('assassin', 100, 1);
  g.state.hero.paragon.level = 300;
  const tr = g.sys.tree;
  eq(tr.paragonFree(), 300);
  eq(tr.addParagon('off.as', 999), 50, 'cap');
  eq(tr.addParagon('off.main', 100), 100);
  ok(g.H.attrs.dex >= computeHero({ ...g.state, hero: { ...g.state.hero, paragon: { level: 0, alloc: {} } } }, null).attrs.dex + 500, 'main dex');
  const n = tr.autoParagon();
  eq(n, 150); eq(tr.paragonFree(), 0);
  tr.resetParagon(); eq(tr.paragonFree(), 300);
});

// ======================================================================= セーブ
t('セーブして読み直すと、刻印・熟練度・星座盤・パラゴン・並びが戻る', () => {
  const g = setupHero('necromancer', 40, 5, 8);
  g.state.hero.tree.points = 30;
  g.sys.tree.allocate('necromancer.b1.n');
  g.state.hero.paragon.alloc['def.main'] = 3;
  g.sys.skills.addGlyph({ id: 'sup_minion', lvl: 4, xp: glyphXpFor(4) });
  const gl = g.state.inv.glyphs.find((x) => x.id === 'sup_minion');
  ok(g.sys.skills.socket('n_skeleton', 0, gl.uid).ok);
  g.state.hero.skills.n_skeleton.rune = 'mage';
  ticks(g, 20);
  const json = JSON.stringify(g.snapshot());
  const g2 = new Game({ seed: 8 }); g2.load(JSON.parse(json));
  const a = g.state.hero; const b = g2.state.hero;
  eq(JSON.stringify(b.tree.alloc), JSON.stringify(a.tree.alloc), 'tree');
  eq(b.paragon.alloc['def.main'], 3);
  eq(b.skills.n_skeleton.supports[0]?.id, 'sup_minion');
  eq(b.skills.n_skeleton.rune, 'mage');
  eq(Math.round(b.skills.n_bonespear.mxp), Math.round(a.skills.n_bonespear.mxp));
  eq(b.bar.join(), a.bar.join());
  ok(g2.H.S.minion_count >= 1, 'tree stat after load');
});
t('古いセーブ（刻印・熟練度・構成が無い）も読める', () => {
  const g = new Game({ seed: 2 });
  g.load({ hero: { cls: 'ranger', level: 12, equip: {}, skills: { r_shot: { lvl: 3, rune: 'split', supports: [] } }, bar: ['r_shot'], tree: { alloc: [], points: 5 } }, inv: { bag: [] } });
  ok(Array.isArray(g.state.inv.glyphs));
  ok(g.state.hero.tree.alloc.includes('ranger.start'));
  ok(g.state.hero.skills.r_multishot?.lvl >= 1, 'start skills learned');
  ok(g.state.hero.skills.r_trap?.lvl >= 1, 'unlocked learned');
  ticks(g, 5);
});

// ======================================================================= 釣り合い（クラスの差）
t('5 クラスの進み具合が ±25% 以内で、最初のボスを越える', () => {
  const MIN = QUICK ? 8 : 15;
  const res = [];
  for (const c of CLASSES) {
    const g = new Game({ seed: 7 }); g.newGame(c.id, 'sim');
    g.state.inv.filter.autoEquip = true;
    for (let m = 0; m < MIN; m++) {
      ticks(g, 60);
      for (const id of Object.keys(g.state.hero.skills)) while (g.sys.skills.canLevel(id)) g.sys.skills.levelUp(id);
    }
    res.push({ id: c.id, lvl: g.state.hero.level + g.state.hero.xp / BAL.xpToNext(g.state.hero.level), zone: g.state.world.maxZone, cleared: !!g.state.world.cleared[ZONES[0].id] });
  }
  const mean = res.reduce((s, r) => s + r.lvl, 0) / res.length;
  for (const r of res) {
    ok(r.cleared, `${r.id} が最初のボスを越えられない`);
    ok(Math.abs(r.lvl / mean - 1) <= 0.25, `${r.id} Lv${r.lvl.toFixed(1)}（平均 ${mean.toFixed(1)}）`);
  }
  console.log(`   釣り合い（${MIN} 分）: ${res.map((r) => `${r.id} Lv${r.lvl.toFixed(1)}`).join(' / ')}`);
});
t('戦闘の 1 ティックが軽い（20 分ぶん 1 クラスが 1.5 秒以内）', () => {
  const g = new Game({ seed: 9 }); g.newGame('necromancer', 'x');
  const t0 = Date.now();
  ticks(g, 20 * 60);
  const ms = Date.now() - t0;
  ok(ms < 1500, `${ms}ms`);
});

console.error = origErr;
console.log(`\ncombat: ${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
