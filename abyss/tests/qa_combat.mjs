// 戦闘の QA（第 3 弾）で見つけた不具合の再発防止。Node だけで動く。実行: node tests/qa_combat.mjs
// 1 つのテストが 1 つの不具合に対応する（直す前のコードでは失敗する）。
import { Game } from '../src/game/game.js';
import { SKILL } from '../src/data/skills.js';
import { SUPPORT, supportFits } from '../src/data/supports.js';
import { SLOTS } from '../src/data/items.js';
import { BAL } from '../src/data/balance.js';
import { resolveSkill, skillDesc } from '../src/game/skills.js';
import { computeHero } from '../src/game/character.js';
import { generateItem } from '../src/game/loot.js';
import { RNG } from '../src/engine/rng.js';
import { GOBLIN } from '../src/game/content/world/goblins.js';

let pass = 0; let fail = 0;
const errors = [];
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
const near = (a, b, eps, m = '') => { if (!(Math.abs(a - b) <= eps)) throw new Error(`${m} ${a} ≉ ${b}`); };

/** レベル L・その Lv のレアの装備・スキル Lv の上限まで振った主人公（並びは bar を渡せばそれ、無ければおまかせ） */
function kitted(cls, L, { bar = null, gear = 'rare', seed = 3 } = {}) {
  const g = new Game({ seed });
  g.newGame(cls, 'QA');
  const st = g.state;
  st.hero.level = L;
  const rng = new RNG(seed * 7 + L);
  for (const slot of SLOTS) {
    if (slot === 'offhand') { const w = st.hero.equip.weapon; if (w && /great|staff|bow|crossbow|scythe/.test(w.base)) { st.hero.equip.offhand = null; continue; } }
    const it = generateItem(rng, { ilvl: L, rarity: gear, slot: slot.startsWith('ring') ? 'ring' : slot, cls });
    if (it) { if (slot.startsWith('ring')) it.slot = 'ring'; st.hero.equip[slot] = it; }
  }
  g.sys.skills.learnUnlocked(true);
  const cap = g.sys.skills.levelCap();
  for (const id of Object.keys(st.hero.skills)) st.hero.skills[id].lvl = cap;
  if (bar) { st.hero.autoBar = false; st.hero.bar = bar.slice(); } else g.sys.skills.autoArrange(true);
  g.combat.recalc(true);
  g.combat.hero.life = g.combat.hero.maxLife;
  g.combat.hero.resource = g.H.resourceMax;
  return g;
}
const sc = (L) => BAL.monsterScale(L);
// 動きを確かめるテストは、敵を硬くする前（BAL.difficultyAt が無い頃）の強さで合わせてある。その倍率を打ち消した強さ
const plain = (L) => { const m = sc(L); const d = BAL.difficultyAt ? BAL.difficultyAt(L) : { life: 1, dmg: 1 }; return { life: m.life / d.life, dmg: m.dmg / d.dmg }; };
const tick = (g, sec, stop = null) => { for (let i = 0; i < sec * 20; i++) { g.combat.tick(0.05); if (stop?.()) return i / 20; } return sec; };
function countCasts(g) {
  const c = g.combat; const casts = {};
  const orig = c.startCast.bind(c);
  c.startCast = (h, p, tgt) => { casts[p.id] = (casts[p.id] || 0) + 1; return orig(h, p, tgt); };
  return casts;
}
function dmgBySkill(g, unit) {
  const c = g.combat; const by = {};
  const orig = c.hitUnit.bind(c);
  c.hitUnit = (src, tgt, p, mult, opts = {}) => { const d = orig(src, tgt, p, mult, opts); if (tgt === unit) by[p?.id] = (by[p?.id] || 0) + d; return d; };
  return by;
}

// ======================================================================= 狩人の動き（ため込み屋・離れた敵）
t('狩人: 逃げるため込み屋に寄って、射程の短い技（扇射ち・矢の雨）と罠も当てる', () => {
  const L = 30;
  const g = kitted('ranger', L, { bar: ['r_snipe', 'r_multishot', 'r_volley', 'r_trap'] });
  const c = g.combat; const h = c.hero;
  c.clearEnemies();
  const gob = c.spawnMonster('goblin_gold', { level: L, rank: 'goblin', x: h.x + 900, y: 0, lifeMul: 1e6 });
  const casts = countCasts(g);
  const by = dmgBySkill(g, gob);
  const fleeCasts = {};
  const orig = c.startCast;
  c.startCast = (hh, p, tgt) => { if (gob.goblin.state === 'flee') fleeCasts[p.id] = (fleeCasts[p.id] || 0) + 1; return orig(hh, p, tgt); };
  tick(g, GOBLIN.escapeSec + 4, () => gob.dead);
  ok((fleeCasts.r_multishot || 0) + (fleeCasts.r_volley || 0) >= 3, `逃げる間の扇射ち・矢の雨 ${JSON.stringify(fleeCasts)}（全体 ${JSON.stringify(casts)}）`);
  ok((by.r_trap || 0) > 0, `罠が逃げる敵に当たらない ${JSON.stringify(Object.keys(by))}`);
});

t('狩人: 離れて撃つ再生の群れの長にも寄って砲台・罠を使い、2 分の見張りに止められない', () => {
  // 以前は基本攻撃の射程の端（700）に立ったまま、射程の短い砲台・罠・狼が届かず、再生に負けて倒せなかった（見張りがステージをやり直していた）
  const L = 40;
  const g = kitted('ranger', L, { bar: ['r_snipe', 'r_beast', 'r_focus', 'r_turret', 'r_trap'], gear: 'magic' });
  const c = g.combat; const h = c.hero;
  c.clearEnemies();
  const u = c.spawnMonster('giant_toad', { level: L, rank: 'rare', elite: ['regen', 'vampiric'], x: h.x + 700, y: 0, lifeMul: plain(L).life, dmgMul: plain(L).dmg });
  const sec = tick(g, 110, () => { if (h.dead) c.reviveHero(); return u.dead; });
  ok(u.dead, `110 秒で倒せない（残り ${(u.life / u.maxLife * 100).toFixed(0)}%・距離 ${Math.round(u.x - h.x)}）`);
  ok(sec < 110, `${sec}`);
});

t('罠: 止まっている敵には、足元に届く距離から投げる（手前に落ちて踏まれない罠を置かない）', () => {
  const L = 30;
  const g = kitted('ranger', L, { bar: ['r_snipe', 'r_trap'] });
  const c = g.combat; const h = c.hero;
  c.clearEnemies();
  const u = c.spawnMonster('halo_archer', { level: L, x: h.x + 620, y: 0, lifeMul: 1e6, dmgMul: 0 });
  u.statuses.stun = { t: 999, immune: undefined }; // 動かない
  const by = dmgBySkill(g, u);
  tick(g, 8);
  ok((by.r_trap || 0) > 0, `罠が当たらない（距離 ${Math.round(u.x - h.x)}）`);
  for (const a of c.areas) if (a.kind === 'trap') ok(Math.abs(a.x - u.x) < 120, `踏まれない所に罠 ${Math.round(a.x - u.x)}`);
});

t('ため込み屋: 逃げる時間は、主人公が追える距離にいる間だけ進む（群れの向こうから流れ矢で逃げ出しても時間切れにならない）', () => {
  const g = kitted('warrior', 10);
  const c = g.combat; const h = c.hero;
  c.clearEnemies();
  const gob = c.spawnMonster('goblin_gold', { level: 10, rank: 'goblin', x: h.x + 1300, y: 0, lifeMul: 1e6 });
  gob.life -= 1; // 遠くから当てられた
  h.statuses.stun = { t: 6, dps: 0 }; // 主人公は手前の群れと戦っている（動けない）
  tick(g, 5);
  ok(gob.goblin.state === 'flee', 'flee');
  near(gob.goblin.t, 0, 1e-9, '遠い間に逃げる時間が進んだ');
  // 追いつけば数え始め、14 秒で消える
  tick(g, 40, () => gob.dead);
  ok(gob.escaped, 'escaped');
});

t('召喚物: 主人公の基本攻撃が届く敵・自分を攻撃している敵とは、650 の外でも戦う', () => {
  const L = 30;
  const g = kitted('ranger', L, { bar: ['r_snipe', 'r_beast'] });
  const c = g.combat; const h = c.hero;
  c.clearEnemies();
  const wolf = c.spawnMinion('wolf', c.params('r_beast'), { x: h.x - 60 });
  h.statuses.stun = { t: 999 }; // 主人公は撃たない
  const u = c.spawnMonster('halo_archer', { level: L, x: h.x + 690, y: 0, lifeMul: 1e6, dmgMul: 0 });
  u.statuses.stun = { t: 999 };
  wolf.x = h.x + 610; wolf.y = 0;
  tick(g, 3);
  ok(u.life < u.maxLife, '狼が 690 先の敵を攻撃しない');
});

// ======================================================================= 自動で使う順
t('矢の雨: 左に扇射ち（待ち時間なし）があっても使われる', () => {
  const L = 20;
  const g = kitted('ranger', L, { bar: ['r_snipe', 'r_multishot', 'r_volley'] });
  const c = g.combat; const h = c.hero;
  const casts = countCasts(g);
  for (let w = 0; w < 12; w++) {
    c.clearEnemies();
    for (let i = 0; i < 6; i++) c.spawnMonster('rot_zombie', { level: L, x: h.x + 700 + i * 40, lifeMul: plain(L).life * 40, dmgMul: 0 });
    tick(g, 15, () => !c.enemyCount());
    tick(g, 1);
  }
  ok((casts.r_volley || 0) >= 8, `矢の雨 ${casts.r_volley || 0} 回（扇射ち ${casts.r_multishot || 0} 回）`);
  ok((casts.r_multishot || 0) >= 8, `扇射ち ${casts.r_multishot || 0} 回`);
});

// ======================================================================= ルーン・刻印・説明の数字
t('召喚物の状態異常が効く（毒蜘蛛・毒の分身・溶岩の巨像・狼の出血）', () => {
  const cases = [['ranger', 'r_beast', 'spider', 'poison', 0.5], ['assassin', 'a_clone', 'poison', 'poison', 0.4], ['necromancer', 'n_golem', 'fire', 'ignite', 0.4], ['ranger', 'r_beast', null, 'bleed', 0.2]];
  for (const [cls, id, rune, st, ch] of cases) {
    const g = kitted(cls, 40);
    g.state.hero.skills[id].rune = rune;
    const p = resolveSkill(g.state, g.H, id);
    const s = p.statuses.find((x) => x.id === st);
    ok(s && Math.abs(s.chance - ch) < 1e-9, `${id}.${rune}: ${JSON.stringify(p.statuses)}`);
  }
  // 実際の戦闘: 毒蜘蛛は毒を与える
  const g = kitted('ranger', 40, { bar: ['r_snipe', 'r_beast'] });
  g.state.hero.skills.r_beast.rune = 'spider';
  g.combat.recalc(true);
  const c = g.combat; const h = c.hero;
  h.statuses.stun = { t: 999 }; // 主人公は攻撃しない
  c.clearEnemies();
  c.spawnMinion('spider', c.params('r_beast'), { x: h.x + 20 });
  const u = c.spawnMonster('rot_zombie', { level: 40, x: h.x + 150, y: 0, lifeMul: 1e6, dmgMul: 0 });
  u.statuses.stun = { t: 999 };
  tick(g, 6);
  ok(u.statuses.poison?.stacks?.length > 0, '毒蜘蛛が毒を与えない');
});

t('死の刻印: 説明のクリティカルダメージの数字が実際と同じ・「深い刻印」で刻印が 1.5 倍続く', () => {
  const g = kitted('assassin', 40);
  const p = resolveSkill(g.state, g.H, 'a_mark');
  const d = skillDesc(g.state, g.H, 'a_mark');
  ok(d.includes(`+${Math.round(p.curse.mark * 100)}%`), d);
  g.state.hero.skills.a_mark.rune = 'deep';
  const q = resolveSkill(g.state, g.H, 'a_mark');
  near(q.curse.dur, p.curse.dur * 1.5, 1e-9, '続く時間');
  ok(skillDesc(g.state, g.H, 'a_mark').includes(`${Math.round(q.curse.dur * 10) / 10} 秒`), '説明の秒数');
});

t('持続の刻印は呪いの続く時間も延ばす', () => {
  const g = kitted('necromancer', 40);
  const a = resolveSkill(g.state, g.H, 'n_curse');
  g.state.hero.skills.n_curse.supports = [{ uid: 1, id: 'sup_linger', lvl: 10, xp: 45 }, null, null];
  const b = resolveSkill(g.state, g.H, 'n_curse');
  ok(b.curse.dur > a.curse.dur * 1.3, `${a.curse.dur} → ${b.curse.dur}`);
});

t('広域・集束の刻印は「当たって弾ける範囲」も変える（氷晶の矢・火球）', () => {
  for (const [cls, id] of [['ranger', 'r_frost'], ['sorcerer', 's_fireball']]) {
    const g = kitted(cls, 40);
    const a = resolveSkill(g.state, g.H, id);
    g.state.hero.skills[id].supports = [{ uid: 1, id: 'sup_area', lvl: 10, xp: 45 }, null, null];
    ok(resolveSkill(g.state, g.H, id).explode > a.explode * 1.25, `${id} 広域`);
    g.state.hero.skills[id].supports = [{ uid: 1, id: 'sup_conc', lvl: 10, xp: 45 }, null, null];
    ok(resolveSkill(g.state, g.H, id).explode < a.explode * 0.8, `${id} 集束`);
  }
});

t('狙い撃ちのルーン「炸裂弾」で弾ける範囲が広がる（効かないルーンにしない）', () => {
  const g = kitted('ranger', 40);
  const a = resolveSkill(g.state, g.H, 'r_snipe');
  g.state.hero.skills.r_snipe.rune = 'explode';
  ok(resolveSkill(g.state, g.H, 'r_snipe').explode > a.explode * 1.4);
});

t('刻印: 売りの効果が無いスキルにははめられない（拡散 → 連鎖・砲台、貫き・追尾 → 弾を撃たない技）', () => {
  const no = [['sup_multi', 'r_chain'], ['sup_multi', 'a_shuriken'], ['sup_multi', 'r_turret'], ['sup_pierce', 'r_volley'], ['sup_pierce', 'w_axes'], ['sup_pierce', 'r_chain'], ['sup_seek', 'r_turret'], ['sup_seek', 'r_ult']];
  for (const [s, k] of no) ok(!supportFits(SUPPORT[s], SKILL[k]), `${s} → ${k}`);
  const yes = [['sup_multi', 'r_shot'], ['sup_multi', 'r_volley'], ['sup_multi', 'w_axes'], ['sup_pierce', 'n_bonespear'], ['sup_pierce', 'r_roll'], ['sup_seek', 's_fireball']];
  for (const [s, k] of yes) ok(supportFits(SUPPORT[s], SKILL[k]), `${s} → ${k}`);
  // はめてあった古いセーブは、読むと持ち物に戻る
  const g = kitted('ranger', 40);
  g.state.hero.skills.r_chain.supports = [{ uid: 77, id: 'sup_multi', lvl: 3, xp: 3 }, null, null];
  const g2 = new Game({ seed: 1 });
  g2.load(JSON.parse(JSON.stringify(g.state)));
  ok(!g2.state.hero.skills.r_chain.supports[0], 'まだはまっている');
  ok(g2.state.inv.glyphs.some((x) => x.id === 'sup_multi'), '持ち物に戻らない');
});

// ======================================================================= 要石・上限・継続ダメージ
t('研ぎ澄まされた一点: 「必ずクリティカル」の技でもクリティカルしない', () => {
  const g = kitted('assassin', 40);
  const c = g.combat;
  c.H = computeHero(g.state, g, { extraMods: [{ s: 'ks_precise', v: 1 }] }); c.skillCache = {};
  const u = c.spawnMonster('rot_zombie', { level: 40, x: c.hero.x + 50, lifeMul: 1e6 });
  let crits = 0;
  const em = c.emit.bind(c);
  c.emit = (e) => { if (e.t === 'dmg' && e.crit) crits++; return em(e); };
  for (let i = 0; i < 20; i++) c.hitUnit(c.hero, u, c.params('a_ult'), 1, { forceCrit: true, noProc: true });
  ok(crits === 0, `${crits} 回クリティカル`);
});

t('クリティカル率はスキルの上乗せ込みでも上限 95%', () => {
  const g = kitted('assassin', 40);
  const c = g.combat;
  c.H.critChance = 0.95;
  const p = { ...c.params('a_dash'), extra: { ...c.params('a_dash').extra, critBonus: 0.5 } };
  const u = c.spawnMonster('rot_zombie', { level: 40, x: c.hero.x + 50, lifeMul: 1e9 });
  let crits = 0; let n = 0;
  const em = c.emit.bind(c);
  c.emit = (e) => { if (e.t === 'dmg' && e.team === 'enemy') { n++; if (e.crit) crits++; } return em(e); };
  for (let i = 0; i < 2000; i++) c.hitUnit(c.hero, u, p, 1, { noProc: true });
  ok(n === 2000, `${n}`);
  ok(crits / n < 0.985, `クリティカル ${(crits / n * 100).toFixed(1)}%`);
});

t('毒・炎上・出血も敵の守り（鋼鉄 -40%・ボスの無敵の間）を通る', () => {
  const g = kitted('assassin', 40);
  const c = g.combat;
  const life = (elite, setup) => {
    c.clearEnemies();
    const u = c.spawnMonster('rot_zombie', { level: 40, x: c.hero.x + 2000, lifeMul: 1e6, dmgMul: 0, elite });
    u.statuses.stun = { t: 999 };
    setup?.(u);
    c.addStatus(u, 'poison', { dps: 1000, dur: 10 });
    c.addStatus(u, 'bleed', { dps: 1000, dur: 10 });
    const before = u.life;
    for (let i = 0; i < 20; i++) c.tickStatuses(u, 0.05);
    return before - u.life;
  };
  const base = life([]);
  ok(base > 1500, `${base}`);
  near(life(['armored']) / base, 0.6, 0.02, '鋼鉄');
  ok(life([], (u) => { u.boss = true; u._invT = c.time + 99; }) < base * 0.1, '無敵の間');
});

t('反射ダメージも敵の守り（鋼鉄 -40%・ボスの無敵の間）を通り、与えたダメージに数える', () => {
  const g = kitted('warrior', 40);
  const c = g.combat; const h = c.hero;
  c.H.thorns = 5000; c.H.dodge = 0; c.H.block = 0;
  const reflect = (elite, setup) => {
    c.clearEnemies();
    const u = c.spawnMonster('rot_zombie', { level: 40, x: h.x + 60, lifeMul: 1e6, dmgMul: 0.001, elite });
    setup?.(u);
    const before = u.life; const d0 = c.stats.dmgDone;
    c.damageAlly(h, 1, 'phys', u);
    return { lost: before - u.life, counted: c.stats.dmgDone - d0 };
  };
  const base = reflect([]);
  near(base.lost, 5000, 1, '反射');
  near(base.counted, 5000, 1, '与えたダメージに数えない');
  near(reflect(['armored']).lost, 3000, 1, '鋼鉄');
  ok(reflect([], (u) => { u.boss = true; u._invT = c.time + 99; }).lost < 500, '無敵の間');
});

t('ため込み屋は当たっても押し返されない（逃げる手助けにならない）', () => {
  const g = kitted('ranger', 30);
  const c = g.combat; const h = c.hero;
  c.clearEnemies();
  const gob = c.spawnMonster('goblin_gold', { level: 30, rank: 'goblin', x: h.x + 300, y: 0, lifeMul: 1e6 });
  gob.statuses.stun = { t: 999 };
  const x0 = gob.x;
  for (let i = 0; i < 10; i++) c.hitUnit(h, gob, c.params('r_snipe'), 1, { noProc: true });
  near(gob.x, x0, 1e-9, '押し返された');
});

t('並びから基本攻撃を外しても、覚えている基本攻撃で戦い続ける（怒りがたまらず止まらない）', () => {
  const g = kitted('warrior', 20, { bar: ['w_cleave'] });
  const c = g.combat; const h = c.hero;
  c.clearEnemies();
  const u = c.spawnMonster('rot_zombie', { level: 20, x: h.x + 90, y: 0, lifeMul: 1e9, dmgMul: 0 });
  u.statuses.stun = { t: 999 };
  tick(g, 30);
  const d0 = c.stats.dmgDone;
  tick(g, 20);
  ok(c.stats.dmgDone - d0 > 0, '30 秒後から何もしていない');
});

t('自動の条件「敵が 3 体以上」: 遠くへ撃つ技は、狙う群れのまわりで数える（離れて撃つクラスでも使われる）', () => {
  const L = 30;
  const g = kitted('ranger', L, { bar: ['r_snipe', 'r_volley'] });
  g.state.hero.autocast.r_volley = { cond: 'pack3' };
  const c = g.combat; const h = c.hero;
  c.clearEnemies();
  for (let i = 0; i < 6; i++) { const u = c.spawnMonster('rot_zombie', { level: L, x: h.x + 560 + i * 25, y: (i % 3 - 1) * 15, lifeMul: 1e6, dmgMul: 0 }); u.statuses.stun = { t: 999 }; }
  const casts = countCasts(g);
  tick(g, 10);
  ok((casts.r_volley || 0) >= 2, `矢の雨 ${casts.r_volley || 0} 回`);
});

console.log(`qa_combat: ${pass} 通過 / ${fail} 失敗`);
if (fail) process.exit(1);
