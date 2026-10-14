// アイテム担当のテスト（Node だけで動く）。実行: node tests/items.mjs
// オプション・レアリティの仕上げ・伝説の力・ユニーク/セット/ミシック・天井・クラフト・宝石/ルーン語・極意・商人・セーブ。
import { Game } from '../src/game/game.js';
import { RNG } from '../src/engine/rng.js';
import { generateItem } from '../src/game/loot.js';
import { itemMods, itemName, weaponStats } from '../src/game/items.js';
import { computeHero } from '../src/game/character.js';
import { registry } from '../src/game/registry.js';
import { AFFIXES, AFFIX, BASES, BASE, WEAPON_KINDS, OFFHAND_KINDS, affixPool, SOCKET_MAX } from '../src/data/items.js';
import { UNIQUES, SETS, MYTHICS, SET_PIECE } from '../src/data/uniques.js';
import { GEMS, RUNES, RUNEWORDS, LEGENDARY_GEMS, lgemUpgradeChance } from '../src/data/gems.js';
import { MATERIALS } from '../src/data/materials.js';
import { SKILLS } from '../src/data/skills.js';
import { CLASSES } from '../src/data/classes.js';
import { statDef } from '../src/data/stats.js';
import { RARITY } from '../src/data/rarity.js';
import { POOLS } from '../src/game/content/items/powerlib.js';
import { LUCK, advanceLuck } from '../src/game/content/items/rewards.js';
import { activeSetBonuses } from '../src/game/content/items/loot.js';
import { ENH_RATE } from '../src/game/systems/crafting.js';

let pass = 0; let fail = 0;
function t(name, fn) {
  try { const r = fn(); if (r === false) throw new Error('false'); pass++; } catch (e) { fail++; console.log(`✘ ${name}: ${e.message}`); }
}
const eq = (a, b, m = '') => { if (a !== b) throw new Error(`${m} ${a} !== ${b}`); };
const ok = (c, m = '') => { if (!c) throw new Error(m || 'false'); };
const finite = (it) => { for (const m of itemMods(it)) if (!Number.isFinite(m.v)) throw new Error(`NaN ${m.s} ${it.base}`); };

function newGame(cls = 'warrior', seed = 11) { const g = new Game({ seed }); g.newGame(cls, 'テスト'); return g; }
function lvl(g, L = 70) { g.state.hero.level = L; g.combat.recalc(); return g; }
function give(g, it) { g.state.inv.bag.push(it); return it; }

// ---------------- データ
t('オプションは 90 以上・段は 10 まで・能力は定義済み', () => {
  ok(AFFIXES.length >= 90, `${AFFIXES.length}`);
  for (const a of AFFIXES) {
    ok(a.tiers.length >= 1 && a.tiers.length <= 10, a.id);
    ok(!statDef(a.s.replace('*', 'x')).unknown, a.s);
    for (let i = 1; i < a.tiers.length; i++) ok(a.tiers[i][0] >= a.tiers[i - 1][0] && a.tiers[i][2] >= a.tiers[i - 1][2], `${a.id} 段の順`);
  }
});
t('T1・T2 はアイテム Lv 100 以上でしか出ない', () => {
  for (const a of AFFIXES) {
    const n = a.tiers.length;
    if (n >= 2) ok(a.tiers[n - 2][0] >= 100 || n <= 3, `${a.id} T2 ${a.tiers[n - 2][0]}`);
    ok(a.tiers[n - 1][0] >= 100, `${a.id} T1 ${a.tiers[n - 1][0]}`);
  }
  const rng = new RNG(4);
  for (let i = 0; i < 2000; i++) {
    const it = generateItem(rng, { ilvl: 60 + (i % 39), rarity: i % 2 ? 'epic' : 'legendary' });
    for (const a of it.affixes) { const af = AFFIX[a.id]; ok(af.tiers[a.t][0] <= it.ilvl, `${a.id} t${a.t} ilvl ${it.ilvl}`); }
  }
});
t('部位ごとのオプションは 12〜18 種', () => {
  for (const slot of ['weapon', 'offhand', 'helm', 'chest', 'gloves', 'belt', 'legs', 'boots', 'amulet', 'ring']) {
    const kinds = slot === 'weapon' ? WEAPON_KINDS : slot === 'offhand' ? OFFHAND_KINDS : [null];
    for (const k of kinds) {
      const b = BASES.find((x) => x.slot === slot && (!k || x.kind === k));
      const n = affixPool(b).length;
      ok(n >= 12 && n <= 18, `${slot}/${k}: ${n}`);
    }
  }
});
t('ユニーク 60 以上・セット 12（2/4/6・倍率 ×3 まで）・ミシック 12', () => {
  ok(UNIQUES.length >= 60, `${UNIQUES.length}`);
  eq(SETS.length, 12);
  eq(MYTHICS.length, 12);
  const ids = new Set();
  for (const u of [...UNIQUES, ...MYTHICS]) { ok(!ids.has(u.id), `重複 ${u.id}`); ids.add(u.id); ok(u.flavor && u.name && u.mods.length, u.id); ok(registry.power(u.power), `力 ${u.power}`); for (const m of u.mods) ok(!statDef(m.s).unknown, `${u.id} ${m.s}`); }
  for (const s of SETS) {
    ok(s.pieces.length >= 4 && s.pieces.length <= 6, s.id);
    for (const k of Object.keys(s.bonus)) ok([2, 4, 6].includes(Number(k)) && Number(k) <= s.pieces.length, `${s.id} ${k}`);
    for (const b of Object.values(s.bonus)) { if (b.power) { const p = registry.power(b.power.id); ok(p, b.power.id); ok(b.power.v <= 200 || b.power.id === 'set_moonshadow_4', `${s.id} 倍率`); } }
  }
  ok(SETS.filter((s) => !s.cls).length === 2 && CLASSES.every((c) => SETS.filter((s) => s.cls === c.id).length === 2), 'クラスごとに 2');
});
t('伝説の力は 100 以上（フックか数値つき）・説明に数字', () => {
  const hand = POOLS.legendary.filter((id) => !id.startsWith('pw_sk_'));
  ok(hand.length >= 100, `${hand.length}`);
  for (const id of POOLS.legendary) {
    const p = registry.power(id);
    ok(p.hooks && (Object.keys(p.hooks).length || p.mods || id === 'pw_u_echo'), `${id} 中身なし`);
    const d = p.desc(registry.powerValue(id, 0.5));
    ok(/\d/.test(d), `${id} 数字なし: ${d}`);
    ok(['atk', 'def', 'util'].includes(p.cat), id);
  }
  // すべてのスキルに「極め」の力
  for (const s of SKILLS) ok(registry.power(`pw_sk_${s.id}`), `pw_sk_${s.id}`);
});
t('宝石 7×10・深淵の宝石 8・ルーン 24・ルーン語 20・素材の名前', () => {
  eq(GEMS.length, 7); eq(LEGENDARY_GEMS.length, 8); eq(RUNES.length, 24); eq(RUNEWORDS.length, 20);
  for (const rw of RUNEWORDS) { ok(rw.runes.every((r) => RUNES.some((x) => x.id === r)), rw.id); ok(registry.power(rw.power.id), rw.id); for (const s of rw.slots) ok(rw.runes.length <= SOCKET_MAX[s], `${rw.id} ソケット`); }
  for (const g of LEGENDARY_GEMS) ok(registry.power(g.power), g.id);
  for (const m of MATERIALS) ok(m.name && m.desc && /[ぁ-んァ-ン一-龥]/.test(m.name), m.id);
  eq(lgemUpgradeChance(20, 10), 100); eq(lgemUpgradeChance(10, 10), 60); ok(lgemUpgradeChance(5, 10) <= 2);
});

// ---------------- 生成
t('どのレアリティ・クラス・アイテムレベルでも壊れない（6000 個）', () => {
  const rng = new RNG(2);
  const R = ['common', 'magic', 'rare', 'epic', 'legendary', 'set', 'unique', 'mythic'];
  for (let i = 0; i < 6000; i++) {
    const it = generateItem(rng, { ilvl: 1 + (i % 140), rarity: R[i % R.length], cls: CLASSES[i % 5].id, anyReq: true });
    ok(it && BASE[it.base], `base ${it?.base}`);
    finite(it);
    ok(itemName(it) && itemName(it) !== '???', 'name');
    ok((it.sockets?.length || 0) <= SOCKET_MAX[it.slot], 'socket max');
    if (RARITY[it.rarity].idx >= 2) ok(it.fp >= 20 && it.fp <= 50, `fp ${it.fp}`);
    if (it.rarity === 'legendary') ok(it.power && registry.power(it.power.id)?.slots.includes(it.slot), `power slot ${it.power?.id} ${it.slot}`);
    if (it.rarity === 'mythic') ok(it.fixed.every((f) => f.g), 'ミシックは大いなる');
    if (it.rarity === 'set') ok(SET_PIECE[it.uniqueId] && it.affixes.length === 3, 'set piece');
    JSON.parse(JSON.stringify(it));
  }
});
t('スマートドロップ: ユニーク・力の 7 割以上がクラスに合う', () => {
  const rng = new RNG(8);
  let fit = 0; let n = 0; let pfit = 0; let pn = 0;
  for (let i = 0; i < 1500; i++) {
    const cls = CLASSES[i % 5];
    const u = generateItem(rng, { ilvl: 70, rarity: 'unique', cls: cls.id, slot: 'weapon' });
    n++; if (cls.weapons.includes(BASE[u.base].kind)) fit++;
    const l = generateItem(rng, { ilvl: 70, rarity: 'legendary', cls: cls.id });
    const p = registry.power(l.power.id);
    pn++; if (!p.cls || p.cls === cls.id) pfit++;
  }
  ok(fit / n > 0.7, `unique ${fit}/${n}`);
  ok(pfit / pn > 0.75, `power ${pfit}/${pn}`);
});
t('原初はすべて最大値・太古より強い', () => {
  const rng = new RNG(5);
  for (let i = 0; i < 200; i++) {
    const it = generateItem(rng, { ilvl: 110, rarity: 'legendary', primalChance: 1 });
    eq(it.q, 2);
    eq(it.power.r, 1);
    for (const a of it.affixes) { const af = AFFIX[a.id]; eq(a.t, af.tiers.length - 1 - (af.tiers.filter((r) => r[0] > 110).length), `${a.id} top`); }
  }
  const u = generateItem(rng, { ilvl: 90, rarity: 'unique', primalChance: 1 });
  ok(u.fixed.every((f) => f.r === 1), 'unique primal');
});
t('ユニークの数値はアイテムレベルで伸びる', () => {
  const rng = new RNG(1);
  const lo = generateItem(rng, { ilvl: 10, rarity: 'unique', cls: 'warrior', def: 'u_grief', primalChance: 1 });
  const hi = generateItem(rng, { ilvl: 90, rarity: 'unique', cls: 'warrior', def: 'u_grief', primalChance: 1 });
  eq(lo.uniqueId, 'u_grief'); eq(hi.uniqueId, 'u_grief');
  ok(weaponStats(hi).max > weaponStats(lo).max * 5, 'weapon');
  ok(hi.fixed[0].v > lo.fixed[0].v, '% も伸びる');
});

// ---------------- 力が実際に効く
t('力のフックが戦闘で動く（全部の力を着けて 60 秒戦ってもエラーなし）', () => {
  for (const cls of CLASSES) {
    const g = newGame(cls.id, 21);
    const all = registry.allPowers();
    g.combat.recalc();
    g.combat.powers = all.map((def) => ({ id: def.id, v: def.pool === 'lgem' ? 30 : registry.powerValue(def.id, 0.7), src: 'test', def }));
    g.combat.skillCache = {};
    const err = console.error; let errs = 0; console.error = (...a) => { errs++; if (errs < 4) err(...a); };
    for (let i = 0; i < 20 * 60; i++) { g.tick(0.05); if (i % 200 === 0) { g.combat.powers = all.map((def) => ({ id: def.id, v: def.pool === 'lgem' ? 30 : registry.powerValue(def.id, 0.7), src: 'test', def })); } }
    console.error = err;
    eq(errs, 0, `${cls.id} errors`);
    ok(g.state.meta.stats.kills > 0, 'kills');
  }
});
t('数値の力は能力に入る（極意・装備）', () => {
  const g = lvl(newGame('ranger'));
  const before = computeHero(g.state, g).S.magic_find || 0;
  const it = generateItem(g.rng, { ilvl: 30, rarity: 'legendary', slot: 'amulet' });
  it.power = { id: 'pw_u_treasure', r: 1 };
  give(g, it);
  eq(g.sys.inv.equip(it.uid).ok, true);
  const after = computeHero(g.state, g).S.magic_find || 0;
  ok(after - before >= 39.9, `${before} → ${after}`);
});
t('スキルの形を変える力（弾 +2）が効く', () => {
  const g = lvl(newGame('ranger'));
  const p0 = g.combat.params('r_shot').count;
  const it = give(g, generateItem(g.rng, { ilvl: 5, rarity: 'legendary', slot: 'weapon', cls: 'ranger' }));
  it.power = { id: 'pw_sk_r_shot', r: 0.5 };
  ok(g.sys.inv.equip(it.uid).ok, 'equip');
  eq(g.combat.params('r_shot').count, p0 + 2);
});
t('セット効果（2/4/6）が数えられ、6 点の力が効く', () => {
  const g = newGame('warrior');
  g.state.hero.level = 60;
  const set = SETS.find((s) => s.id === 'set_ironblood');
  for (const pc of set.pieces) {
    const it = give(g, generateItem(g.rng, { ilvl: 60, rarity: 'set', piece: pc.id, cls: 'warrior' }));
    eq(it.uniqueId, pc.id);
    const r = g.sys.inv.equip(it.uid);
    ok(r.ok, r.msg);
  }
  const b = activeSetBonuses(g.state);
  eq(b.length, 3);
  ok(g.combat.powers.some((p) => p.id === 'set_ironblood_6'), '6 点の力');
  ok((computeHero(g.state, g).S.dr || 0) >= 10, 'dr');
});

// ---------------- 天井
t('幸運ゲージ: 天井で必ずレジェンダリー以上・ミシック', () => {
  const g = newGame('sorcerer');
  const l = g.state.inv.luck;
  l.leg = LUCK.leg.max - 1;
  let extra = advanceLuck(g, 1, []);
  ok(extra.length === 1 && RARITY[extra[0].rarity].idx >= 4, `leg ${extra[0]?.rarity}`);
  eq(l.leg, 0);
  l.myth = LUCK.myth.max - 1;
  extra = advanceLuck(g, 1, []);
  ok(extra.some((x) => x.rarity === 'mythic'), 'mythic');
  // 自然に出たらリセット
  l.leg = 100; advanceLuck(g, 3, [{ rarity: 'unique' }]); eq(l.leg, 0);
});
t('幸運ゲージ: 戦闘で進み、オフラインでも進む', () => {
  const g = newGame('necromancer', 33);
  for (let i = 0; i < 20 * 120; i++) g.tick(0.05);
  ok(g.state.inv.luck.rolls > 0, 'rolls');
  const before = g.state.inv.luck.rolls;
  const rep = g.sys.offline.grant(6 * 3600, { reason: 'offline' });
  ok(rep && rep.luck, 'report');
  ok(g.state.inv.luck.rolls > before, 'offline rolls');
  ok(rep.found && Object.keys(rep.found).length, 'found');
});

// ---------------- クラフト
function richGame(cls = 'warrior') {
  const g = lvl(newGame(cls, 5));
  g.state.meta.gold = 1e12;
  for (const m of MATERIALS) g.state.inv.mats[m.id] = 100000;
  return g;
}
t('強化: +20 まで上がる・壊れない・下がらない・天井で必ず成功・節目', () => {
  const g = richGame();
  const it = give(g, generateItem(g.rng, { ilvl: 50, rarity: 'rare', slot: 'weapon', cls: 'warrior' }));
  let tries = 0; let maxPity = 0; let prev = 0;
  while ((it.enh || 0) < 20 && tries < 2000) {
    const info = g.sys.crafting.enhanceInfo(it);
    const r = g.sys.crafting.enhance(it.uid);
    ok(r.ok, r.msg);
    ok((it.enh || 0) >= prev, '下がらない');
    if (!r.success) { maxPity = Math.max(maxPity, it.enhPity); ok(it.enhPity <= info.need, `天井 ${it.enhPity}/${info.need}`); }
    prev = it.enh || 0; tries++;
  }
  eq(it.enh, 20);
  ok(it.enh15 && it.enh20, '節目');
  ok(it.affixes.some((a) => a.g), '大いなる');
  eq(g.sys.crafting.enhanceInfo(it).ok, false);
  eq(ENH_RATE.length, 20);
});
t('段上げ: FP を使って 1 段上がる・上限で止まる', () => {
  const g = richGame();
  const it = give(g, generateItem(g.rng, { ilvl: 90, rarity: 'rare', slot: 'ring' }));
  it.fp = 50;
  const i = it.affixes.findIndex((a) => a.t < 5);
  if (i >= 0) {
    const t0 = it.affixes[i].t;
    const r = g.sys.crafting.tierUp(it.uid, i);
    ok(r.ok, r.msg);
    ok(it.affixes[i].t > t0 && it.fp < 50 || r.crit, 'up');
  }
  it.fp = 0;
  eq(g.sys.crafting.tierUpInfo(it, 0).ok, false);
});
t('付け替え: 候補 2 つ＋そのまま・以後その行だけ・費用が上がる', () => {
  const g = richGame();
  const it = give(g, generateItem(g.rng, { ilvl: 40, rarity: 'rare', slot: 'helm' }));
  const c0 = g.sys.crafting.rerollInfo(it, 1).cost.gold;
  const r = g.sys.crafting.rerollRoll(it.uid, 1);
  ok(r.ok && r.opts.length === 2, r.msg);
  ok(g.sys.crafting.rerollRoll(it.uid, 1).ok === false, '選ぶまで次は無い');
  const pick = it.rrPending.opts[0];
  ok(g.sys.crafting.rerollChoose(it.uid, 0).ok, 'choose');
  eq(it.affixes[1].id, pick.id);
  eq(g.sys.crafting.rerollInfo(it, 0).ok, false);
  ok(g.sys.crafting.rerollInfo(it, 1).cost.gold > c0, '費用');
  const stats = it.affixes.map((a) => a.s);
  eq(new Set(stats).size, stats.length, '同じ能力が重ならない');
});
t('混沌・昇格・祝福・穿孔', () => {
  const g = richGame('sorcerer');
  const m = give(g, generateItem(g.rng, { ilvl: 40, rarity: 'magic', slot: 'amulet', cls: 'sorcerer' }));
  ok(g.sys.crafting.ascend(m.uid).ok); eq(m.rarity, 'rare'); ok(m.affixes.length >= 3 && m.name, 'rare');
  ok(g.sys.crafting.ascend(m.uid).ok); eq(m.rarity, 'epic'); ok(m.affixes.length >= 5, 'epic');
  const before = JSON.stringify(m.affixes);
  ok(g.sys.crafting.chaos(m.uid).ok); ok(JSON.stringify(m.affixes) !== before, 'chaos');
  const tiers = m.affixes.map((a) => a.t).join();
  ok(g.sys.crafting.bless(m.uid).ok); eq(m.affixes.map((a) => a.t).join(), tiers, '段はそのまま');
  const w = give(g, generateItem(g.rng, { ilvl: 40, rarity: 'common', slot: 'weapon', noSockets: true }));
  w.sockets = [];
  for (let i = 0; i < 3; i++) ok(g.sys.crafting.drill(w.uid).ok, 'drill');
  eq(w.sockets.length, 3);
  eq(g.sys.crafting.drill(w.uid).ok, false);
  const u = give(g, generateItem(g.rng, { ilvl: 60, rarity: 'unique', cls: 'sorcerer' }));
  ok(g.sys.crafting.bless(u.uid).ok, 'unique bless');
});
t('堕落: 4 通り・以後は変えられない', () => {
  const g = richGame();
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const it = give(g, generateItem(g.rng, { ilvl: 60, rarity: 'rare', slot: 'chest' }));
    const r = g.sys.crafting.corrupt(it.uid);
    ok(r.ok, r.msg);
    seen.add(r.outcome);
    eq(it.corrupted, 1);
    eq(g.sys.crafting.enhance(it.uid).ok, false);
    eq(g.sys.crafting.corrupt(it.uid).ok, false);
    finite(it);
  }
  eq(seen.size, 4);
});

// ---------------- 宝石・ルーン
t('宝石: 3 つで合成・はめる・外す（無料）・場所で効果が違う', () => {
  const g = richGame();
  g.state.inv.gems = { ember_1: 9 };
  ok(g.sys.gems.combineGem('ember', 1).ok);
  eq(g.state.inv.gems.ember_1, 6); eq(g.state.inv.gems.ember_2, 1);
  const r = g.sys.gems.combineAllGems('ember');
  ok(r.ok && g.state.inv.gems.ember_3 === 1, JSON.stringify(g.state.inv.gems));
  const w = give(g, generateItem(g.rng, { ilvl: 30, rarity: 'rare', slot: 'weapon', noSockets: true })); w.sockets = [null];
  const a = give(g, generateItem(g.rng, { ilvl: 30, rarity: 'rare', slot: 'chest', noSockets: true })); a.sockets = [null];
  g.state.inv.gems.ember_3 = 2;
  ok(g.sys.gems.socket(w.uid, 0, 'ember_3').ok); ok(g.sys.gems.socket(a.uid, 0, 'ember_3').ok);
  ok(registry.socketMods(w).some((m) => m.s === 'add_fire'), 'weapon fire');
  ok(registry.socketMods(a).some((m) => m.s === 'res_fire'), 'armor res');
  ok(g.sys.gems.unsocket(w.uid, 0).ok); eq(g.state.inv.gems.ember_3, 1);
});
t('ルーン語: ノーマルの 2 ソケット武器に順番どおり → 名前と力', () => {
  const g = richGame('warrior');
  g.state.inv.runes = { rin: 1, hai: 1 };
  const w = give(g, generateItem(g.rng, { ilvl: 20, rarity: 'common', slot: 'weapon', cls: 'warrior', noSockets: true }));
  w.sockets = [null, null];
  ok(g.sys.gems.socket(w.uid, 0, 'r:rin').ok);
  ok(g.sys.gems.runewordProgress(w).some((x) => x.id === 'rw_kindle'), 'progress');
  const r = g.sys.gems.socket(w.uid, 1, 'r:hai');
  eq(r.runeword, 'rw_kindle');
  eq(itemName(w), '焚き火');
  ok(w.power?.id === 'pw_ashheart', 'power');
  eq(g.sys.gems.unsocket(w.uid, 0).ok, false);
  ok(registry.uniqueMods(w).some((m) => m.s === 'ignite_chance'), 'rw mods');
  // 順番が違えばならない
  g.state.inv.runes = { rin: 1, hai: 1 };
  const w2 = give(g, generateItem(g.rng, { ilvl: 20, rarity: 'common', slot: 'weapon', cls: 'warrior', noSockets: true }));
  w2.sockets = [null, null];
  g.sys.gems.socket(w2.uid, 0, 'r:hai'); const r2 = g.sys.gems.socket(w2.uid, 1, 'r:rin');
  eq(r2.runeword, null);
  g.state.inv.runes = { hai: 3 };
  ok(g.sys.gems.combineRune('hai').ok); eq(g.state.inv.runes.rin, 1);
});
t('深淵の宝石: 裂け目で育ち、首飾り・指輪にだけはまる', () => {
  const g = richGame('assassin');
  const rep = g.sys.gems.onRiftComplete(30, 0.7);
  ok(rep.found, '最初の 1 つ');
  ok(rep.tries.length === 3, `tries ${rep.tries.length}`);
  ok(rep.to > rep.from, 'up');
  const id = rep.found;
  const ring = give(g, generateItem(g.rng, { ilvl: 30, rarity: 'rare', slot: 'ring', noSockets: true })); ring.sockets = [null];
  const chest = give(g, generateItem(g.rng, { ilvl: 30, rarity: 'rare', slot: 'chest', noSockets: true })); chest.sockets = [null];
  eq(g.sys.gems.socket(chest.uid, 0, `lg:${id}`).ok, false);
  ok(g.sys.gems.socket(ring.uid, 0, `lg:${id}`).ok);
  ok(g.sys.inv.equip(ring.uid).ok);
  ok(g.combat.powers.some((p) => p.id === `lgp_${id}` && p.v === g.sys.gems.lgemLevel(id)), 'power');
  g.sys.gems.onRiftComplete(60, 0.9);
  eq(ring.lgl[id], g.sys.gems.lgemLevel(id), '装備に写る');
  for (let i = 0; i < 40; i++) g.sys.gems.onRiftComplete(10 + i, 0.5);
  eq(Object.keys(g.state.inv.lgems).length <= 8, true);
});

// ---------------- 極意・商人
t('極意: 抽出して一番良いロールを残し、分類の枠に着ける', () => {
  const g = richGame('ranger');
  const a = give(g, generateItem(g.rng, { ilvl: 40, rarity: 'legendary', slot: 'ring' })); a.power = { id: 'pw_crowdbreak', r: 0.3 };
  const b = give(g, generateItem(g.rng, { ilvl: 40, rarity: 'legendary', slot: 'ring' })); b.power = { id: 'pw_crowdbreak', r: 0.8 };
  const c = give(g, generateItem(g.rng, { ilvl: 40, rarity: 'legendary', slot: 'ring' })); c.power = { id: 'pw_crowdbreak', r: 0.5 };
  ok(g.sys.codex.extract(a.uid).ok); ok(g.sys.codex.extract(b.uid).ok); ok(g.sys.codex.extract(c.uid).ok);
  eq(g.state.meta.codex.powers.pw_crowdbreak, 0.8);
  eq(g.sys.codex.equip(1, 'pw_crowdbreak').ok, false, '守りの枠には入らない');
  ok(g.sys.codex.equip(0, 'pw_crowdbreak').ok);
  ok(g.combat.powers.some((p) => p.id === 'pw_crowdbreak' && p.src === 'codex'), 'active');
  const u = give(g, generateItem(g.rng, { ilvl: 40, rarity: 'unique', cls: 'ranger' }));
  eq(g.sys.codex.extractInfo(u).ok, false, 'ユニークは不可');
});
t('商人: 目利き・拡張・素材・ミシックの交換', () => {
  const g = richGame('necromancer');
  const n0 = g.state.inv.bag.length;
  for (let i = 0; i < 30; i++) ok(g.sys.merchant.gamble('ring').ok);
  eq(g.state.inv.bag.length, n0 + 30);
  ok(g.state.inv.bag.slice(n0).every((x) => x.slot === 'ring' && RARITY[x.rarity].idx >= 2), 'ring rare+');
  const s0 = g.state.inv.bagSize;
  ok(g.sys.merchant.expandBag().ok); eq(g.state.inv.bagSize, s0 + 20);
  while (g.sys.merchant.expandBag().ok);
  eq(g.state.inv.bagSize, 200);
  while (g.sys.merchant.addStashTab().ok);
  eq(g.state.inv.stash.length, 8);
  ok(g.sys.merchant.buyMat('scrap', 2).ok); ok(g.sys.merchant.sellMat('crystal', 5).ok);
  const r = g.sys.merchant.exchangeMythic('m_fate');
  ok(r.ok && r.item.rarity === 'mythic' && r.item.uniqueId === 'm_fate', r.msg);
  const lv = g.sys.merchant.luck();
  ok(lv.leg.max === LUCK.leg.max && lv.myth.max === LUCK.myth.max, 'luck view');
});
t('自動の振り分け: ユニーク・太古・ルーン語の白ベースは残す', () => {
  const g = newGame('warrior');
  const f = g.state.inv.filter;
  Object.assign(f.autoSalvage, { common: true, magic: true, rare: true, epic: true, legendary: true, unique: true, set: true });
  f.keepUpgrades = false;
  const u = generateItem(g.rng, { ilvl: 30, rarity: 'unique' });
  eq(g.sys.inv.receive(u), 'bag');
  const w = generateItem(g.rng, { ilvl: 30, rarity: 'common', slot: 'weapon', noSockets: true }); w.sockets = [null, null];
  eq(g.sys.inv.receive(w), 'bag');
  const r = generateItem(g.rng, { ilvl: 30, rarity: 'rare' });
  eq(g.sys.inv.receive(r), 'salvaged');
  const an = generateItem(g.rng, { ilvl: 30, rarity: 'legendary', ancientChance: 1 });
  eq(g.sys.inv.receive(an), 'bag');
});

// ---------------- セーブ
t('セーブして読み直せる（宝石・ルーン語・極意・天井・クラフトの状態）', () => {
  const g = richGame('assassin');
  g.sys.gems.onRiftComplete(20, 0.5);
  const it = give(g, generateItem(g.rng, { ilvl: 50, rarity: 'rare', slot: 'weapon', cls: 'assassin' }));
  for (let i = 0; i < 6; i++) g.sys.crafting.enhance(it.uid);
  g.sys.crafting.rerollRoll(it.uid, 0);
  const l = give(g, generateItem(g.rng, { ilvl: 40, rarity: 'legendary', slot: 'ring' }));
  g.sys.codex.extract(l.uid);
  for (let i = 0; i < 20 * 60; i++) g.tick(0.05);
  const json = JSON.stringify(g.snapshot());
  const g2 = new Game({ seed: 1 });
  g2.load(JSON.parse(json));
  eq(JSON.stringify(g2.state.inv.lgems), JSON.stringify(g.state.inv.lgems));
  eq(JSON.stringify(g2.state.meta.codex), JSON.stringify(g.state.meta.codex));
  eq(g2.state.inv.luck.leg, g.state.inv.luck.leg);
  const it2 = g2.sys.inv.findItem(it.uid).item;
  eq(it2.enh, it.enh); ok(it2.rrPending, 'pending');
  ok(g2.sys.crafting.rerollChoose(it.uid, 2).ok);
  eq(JSON.stringify(computeHero(g2.state, g2).S), JSON.stringify(computeHero(g.state, g).S));
});
t('古いセーブ（アイテム担当の項目なし）でも読める', () => {
  const g = newGame('ranger');
  const raw = JSON.parse(JSON.stringify(g.snapshot()));
  delete raw.inv.luck; delete raw.inv.lgems; delete raw.inv.runes; delete raw.meta.codex; delete raw.inv.filter.preset;
  const g2 = new Game({ seed: 2 }); g2.load(raw);
  ok(g2.state.inv.luck && g2.state.inv.lgems && g2.state.meta.codex.equipped.length === 3 && g2.state.inv.filter.preset, 'filled');
  for (let i = 0; i < 200; i++) g2.tick(0.05);
});

// ---------------- 重さ
t('戦闘の 1 ティックが軽い（力を 10 個着けても 1 ティック 0.5ms 未満）', () => {
  const g = newGame('sorcerer', 3);
  const ids = ['pw_orbit', 'pw_crowdbreak', 'pw_killlust', 'pw_s_orb', 'pw_wildfire', 'pw_d_barrier', 'pw_resonance', 'pw_mercy', 'pw_starburst', 'pw_corpseblast'];
  for (let i = 0; i < 400; i++) g.tick(0.05);
  g.combat.powers = ids.map((id) => ({ id, v: registry.powerValue(id, 0.5), def: registry.power(id) }));
  const t0 = performance.now();
  for (let i = 0; i < 4000; i++) { g.tick(0.05); if (i % 100 === 0) g.combat.powers = ids.map((id) => ({ id, v: registry.powerValue(id, 0.5), def: registry.power(id) })); }
  const per = (performance.now() - t0) / 4000;
  ok(per < 0.5, `${per.toFixed(3)}ms`);
});

console.log(`\nitems: ${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
